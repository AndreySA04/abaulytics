"""HTTP entry points for production, the line collector and corporate orders."""

import asyncio
import csv
import io
import json
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Annotated, Literal

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from PIL import Image, ImageDraw
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .industrial_store import IndustrialStore, audit, filters_sql, micrometers, token_hash, utc
from .stereo import Calibration, FORMATS, MAX_IMAGE_BYTES, METHODS, measure_pair, rectification


router = APIRouter(prefix="/v1")
bearer = HTTPBearer(auto_error=False)
reports = threading.BoundedSemaphore(1)


@lru_cache(maxsize=1)
def open_store(path, mode):
    return IndustrialStore(path, mode)


def get_store():
    path = os.getenv("ABAULYTICS_INDUSTRIAL_DB")
    mode = os.getenv("ABAULYTICS_INDUSTRIAL_MODE", "bancada")
    if not path:
        raise HTTPException(503, "Modo Produção indisponível neste servidor.")
    if mode not in ("bancada", "producao"):
        raise HTTPException(503, "Ambiente industrial inválido.")
    if mode == "producao" and not os.getenv("ABAULYTICS_APPROVED_POLICY", "").strip():
        raise HTTPException(503, "Configure a política industrial aprovada.")
    return open_store(path, mode)


Store = Annotated[IndustrialStore, Depends(get_store)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def token_of(credentials):
    if not credentials or len(credentials.credentials) > 256:
        raise HTTPException(401, "Credencial necessária.", headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials


def account(store: Store, credentials: Credentials):
    return store.authenticate(token_of(credentials))


def allow(*roles):
    def check(actor=Depends(account)):
        if actor["role"] not in roles:
            raise HTTPException(403, "Acesso restrito a outro papel.")
        return actor
    return check


def service(key):
    def check(credentials: Credentials):
        configured = os.getenv(key, "")
        received = token_of(credentials)
        other_key = "ABAULYTICS_CORPORATE_KEY" if key == "ABAULYTICS_COLLECTOR_KEY" else "ABAULYTICS_COLLECTOR_KEY"
        if (len(configured) < 32 or configured == os.getenv(other_key)
                or not secrets.compare_digest(received.encode(), configured.encode())):
            raise HTTPException(401, "Credencial de serviço inválida.")
    return check


Reader = Annotated[dict, Depends(allow("operador", "analista", "lider"))]
Analyst = Annotated[dict, Depends(allow("analista", "lider"))]
Operator = Annotated[dict, Depends(allow("operador"))]
Technician = Annotated[dict, Depends(allow("tecnico"))]
Auditor = Annotated[dict, Depends(allow("auditor"))]
collector_only = [Depends(service("ABAULYTICS_COLLECTOR_KEY"))]
corporate_only = [Depends(service("ABAULYTICS_CORPORATE_KEY"))]

Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")]
Classification = Literal["conforme", "nao_conforme"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    badge: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)

    model_config = ConfigDict(str_strip_whitespace=False)


class DeleteAccount(Login):
    pass


class ProductionOrder(Input):
    width_mm: float = Field(ge=0.001, le=100_000, allow_inf_nan=False)
    product: str = Field(min_length=1, max_length=120)
    status: Literal["disponivel", "encerrada"] = "disponivel"


class LotStart(Input):
    order_number: Identifier


class Algorithm(Input):
    method: Literal["estereo_vertical_v1", "estereo_vertical_v2"]


class Selection(Input):
    version: Identifier
    calibration_id: Identifier


class Incident(Input):
    lot_id: int = Field(gt=0)
    expected: int = Field(gt=0, le=2_147_483_647)
    received: int = Field(gt=0, le=2_147_483_647)
    observed_at: AwareDatetime


class Heartbeat(Input):
    buffered: int = Field(ge=0)


class Rendered(Input):
    sample_id: int = Field(gt=0)
    rendered_at: AwareDatetime


class Filters(Input):
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    order_number: Identifier | None = None
    product: str | None = Field(default=None, max_length=120)
    classification: Classification | None = None
    width_mm: float | None = Field(default=None, ge=0.001, le=100_000, allow_inf_nan=False)

    def sql(self):
        if self.start and self.end and self.start >= self.end:
            raise HTTPException(422, "O fim precisa ser posterior ao início.")
        return {"start": utc(self.start) if self.start else None,
                "end": utc(self.end) if self.end else None,
                "order_number": self.order_number, "product": self.product,
                "classification": self.classification,
                "width_um": micrometers(self.width_mm) if self.width_mm is not None else None}


class ReportRequest(Filters):
    format: Literal["pdf", "csv"]
    ceiling: int = Field(ge=0)


class ReadingFilters(Filters):
    before: int | None = Field(default=None, ge=1)
    ceiling: int | None = Field(default=None, ge=0)


def ensure_idle(store, conn):
    if store.current_lot(conn):
        raise HTTPException(409, "Encerre o lote ativo antes de alterar a configuração.")


@router.post("/auth/login")
def login(data: Login, store: Store):
    return store.login(data.badge.strip(), data.password)


@router.post("/auth/logout", status_code=204)
def logout(store: Store, credentials: Credentials, actor=Depends(account)):
    with store.connection(write=True) as conn:
        conn.execute("DELETE FROM session WHERE token_hash=?", (token_hash(token_of(credentials)),))
        audit(conn, "logout", actor)


@router.post("/auth/remove-account", status_code=204)
def remove_account(data: DeleteAccount, store: Store, actor=Depends(account)):
    if data.badge.strip() != actor["badge"]:
        raise HTTPException(403, "A conta não corresponde à sessão.")
    try:
        verified, _ = store.verify_credentials(actor["badge"], data.password, issue_session=False)
    except HTTPException as error:
        if error.status_code == 401:
            raise HTTPException(403, "Senha de confirmação inválida.") from error
        raise
    if verified["id"] != actor["id"]:
        raise HTTPException(403, "A conta não corresponde à sessão.")
    with store.connection(write=True) as conn:
        current = store.current_lot(conn)
        if current and conn.execute("SELECT 1 FROM lot_operator WHERE lot_id=? AND account_id=?",
                                    (current["id"], actor["id"])).fetchone():
            raise HTTPException(409, "Encerre o lote antes de desvincular esta conta.")
        audit(conn, "conta_desvinculada", actor)
        conn.execute("DELETE FROM account WHERE id=?", (actor["id"],))


@router.get("/configuration")
def configuration(store: Store, actor: Technician):
    with store.connection() as conn:
        return {
            "active": dict(conn.execute("SELECT version,calibration_id FROM configuration").fetchone()),
            "versions": [dict(row) for row in conn.execute("SELECT * FROM algorithm ORDER BY registered_at DESC")],
            "calibrations": [dict(row) for row in conn.execute("SELECT id,registered_at FROM calibration ORDER BY registered_at DESC")],
        }


@router.put("/algorithms/{version}", status_code=204)
def register_algorithm(version: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")], data: Algorithm,
                       store: Store, actor: Technician):
    with store.connection(write=True) as conn:
        existing = conn.execute("SELECT method FROM algorithm WHERE version=?", (version,)).fetchone()
        if existing and existing["method"] != data.method:
            raise HTTPException(409, "Versão já associada a outro método.")
        if not existing:
            conn.execute("INSERT INTO algorithm VALUES (?,?,?)", (version, data.method, utc()))
            audit(conn, "versao_registrada", actor, detail=version)


@router.put("/calibrations/{calibration_id}", status_code=204)
def register_calibration(calibration_id: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")],
                         data: Calibration, store: Store, actor: Technician):
    serialized = data.model_dump_json()
    try:
        rectification(serialized)
    except (ValueError, cv2.error) as error:
        raise HTTPException(422, "Calibração estéreo incompatível com a montagem.") from error
    with store.connection(write=True) as conn:
        existing = conn.execute("SELECT parameters FROM calibration WHERE id=?", (calibration_id,)).fetchone()
        if existing and existing["parameters"] != serialized:
            raise HTTPException(409, "Use um novo identificador para alterar uma calibração.")
        if not existing:
            conn.execute("INSERT INTO calibration VALUES (?,?,?)", (calibration_id, serialized, utc()))
            audit(conn, "calibracao_registrada", actor, detail=calibration_id)


@router.put("/configuration/active", status_code=204)
def activate(data: Selection, store: Store, actor: Technician):
    with store.connection(write=True) as conn:
        ensure_idle(store, conn)
        if not (conn.execute("SELECT 1 FROM algorithm WHERE version=?", (data.version,)).fetchone()
                and conn.execute("SELECT 1 FROM calibration WHERE id=?", (data.calibration_id,)).fetchone()):
            raise HTTPException(404, "Versão ou calibração inexistente.")
        conn.execute("UPDATE configuration SET version=?,calibration_id=? WHERE id=1",
                     (data.version, data.calibration_id))
        audit(conn, "configuracao_ativada", actor, detail=f"{data.version}/{data.calibration_id}")


@router.put("/corporate/orders/{order_number}", status_code=204, dependencies=corporate_only)
def put_order(order_number: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")],
              data: ProductionOrder, store: Store):
    with store.connection(write=True) as conn:
        lot = store.current_lot(conn)
        existing = conn.execute("SELECT width_um,product,status FROM production_order WHERE number=?", (order_number,)).fetchone()
        values = (micrometers(data.width_mm), data.product, data.status)
        if existing and tuple(existing) == values:
            return
        if lot and lot["order_number"] == order_number:
            raise HTTPException(409, "Encerre o lote antes de alterar esta ordem.")
        conn.execute("""
            INSERT INTO production_order VALUES (?,?,?,?,?) ON CONFLICT(number) DO UPDATE
            SET width_um=excluded.width_um,product=excluded.product,status=excluded.status,updated_at=excluded.updated_at
        """, (order_number, *values, utc()))
        audit(conn, "ordem_atualizada", detail=order_number, role="integracao")


@router.get("/orders")
def orders(store: Store, actor: Operator, q: str = Query("", max_length=64)):
    with store.connection() as conn:
        return [dict(row) for row in conn.execute("""
            SELECT number,product,width_um FROM production_order WHERE status='disponivel'
            AND instr(lower(number),lower(?))>0 ORDER BY number LIMIT 30
        """, (q.strip(),))]


@router.post("/lots", status_code=201)
def start_lot(data: LotStart, store: Store, actor: Operator):
    with store.connection(write=True) as conn:
        ensure_idle(store, conn)
        order = conn.execute("SELECT * FROM production_order WHERE number=? AND status='disponivel'",
                             (data.order_number,)).fetchone()
        if not order:
            raise HTTPException(422, "Ordem de produção indisponível.")
        config = conn.execute("SELECT * FROM configuration").fetchone()
        if not config["calibration_id"]:
            raise HTTPException(409, "Ative uma calibração antes de iniciar o lote.")
        lot_id = conn.execute("""
            INSERT INTO lot(line_id,order_number,width_um,product,version,calibration_id,started_at)
            VALUES ('linha-1',?,?,?,?,?,?)
        """, (order["number"], order["width_um"], order["product"], config["version"],
              config["calibration_id"], utc())).lastrowid
        conn.execute("INSERT INTO lot_operator VALUES (?,?)", (lot_id, actor["id"]))
        audit(conn, "lote_aberto", actor, detail=str(lot_id))
        return store.current_lot(conn)


@router.post("/lots/{lot_id}/close", status_code=204)
def close_lot(lot_id: int, store: Store, actor: Operator):
    with store.connection(write=True) as conn:
        current = store.current_lot(conn)
        if not current or current["id"] != lot_id:
            raise HTTPException(409, "O lote informado não está aberto.")
        conn.execute("UPDATE lot SET ended_at=? WHERE id=?", (utc(), lot_id))
        audit(conn, "lote_encerrado", actor, detail=str(lot_id))


@router.get("/collector/context", dependencies=collector_only)
def collector_context(store: Store):
    with store.connection() as conn:
        lot = store.current_lot(conn)
        if lot:
            row = conn.execute("SELECT parameters FROM calibration WHERE id=?", (lot["calibration_id"],)).fetchone()
            lot["calibration"] = json.loads(row["parameters"])
        return {"installation_id": store.installation_id, "mode": store.mode, "lot": lot}


@router.post("/collector/heartbeat", status_code=204, dependencies=collector_only)
def heartbeat(data: Heartbeat, store: Store):
    with store.connection(write=True) as conn:
        conn.execute("""
            INSERT INTO collector_health VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,buffered=excluded.buffered
        """, (utc(), data.buffered))


@router.post("/collector/incidents", status_code=204, dependencies=collector_only)
def incident(data: Incident, store: Store):
    if data.received <= data.expected:
        raise HTTPException(422, "Informe uma lacuna na sequência.")
    with store.connection(write=True) as conn:
        if not conn.execute("SELECT 1 FROM lot WHERE id=?", (data.lot_id,)).fetchone():
            raise HTTPException(404, "Lote inexistente.")
        conn.execute("INSERT OR IGNORE INTO line_incident(lot_id,expected,received,observed_at) VALUES (?,?,?,?)",
                     (data.lot_id, data.expected, data.received, utc(data.observed_at)))


@router.post("/collector/samples", dependencies=collector_only)
def record_sample(store: Store, lot_id: Annotated[int, Form(gt=0)],
                  sequence: Annotated[int, Form(gt=0, le=2_147_483_647)],
                  observed_at: Annotated[AwareDatetime, Form()],
                  captured_at: Annotated[AwareDatetime | None, Form()] = None,
                  failure: Annotated[Literal["camera_indisponivel", "janela_expirada", "par_nao_sincronizado",
                                             "captura_interrompida"] | None, Form()] = None,
                  left: Annotated[UploadFile | None, File()] = None,
                  right: Annotated[UploadFile | None, File()] = None):
    if sequence % 50 or observed_at > datetime.now(timezone.utc) + timedelta(seconds=5):
        raise HTTPException(422, "Sequência ou horário de amostra inválido.")
    pair = None
    if left and right and captured_at and not failure:
        if not observed_at <= captured_at <= observed_at + timedelta(seconds=5):
            raise HTTPException(422, "Horário de captura fora da janela da chapa.")
        pair = []
        for image in (left, right):
            content = image.file.read(MAX_IMAGE_BYTES + 1)
            if len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(413, "Cada vista aceita até 10 MiB.")
            if image.content_type not in FORMATS or not content:
                raise HTTPException(415, "Use duas imagens JPEG ou PNG.")
            pair.append((image.content_type, content))
    elif left or right or captured_at or not failure:
        raise HTTPException(422, "Informe o par capturado ou o motivo da falha.")
    return store.record_sample(lot_id=lot_id, sequence=sequence, observed_at=utc(observed_at),
                               captured_at=utc(captured_at) if captured_at else None,
                               pair=pair, failure=failure, measure=measure_pair)


@router.get("/dashboard")
def dashboard(store: Store, actor: Reader):
    with store.connection() as conn:
        conn.execute("BEGIN")
        lot = store.current_lot(conn)
        cursor = conn.execute("SELECT coalesce(max(id),0) FROM sample").fetchone()[0]
        demo = store.mode == "bancada"
        health = conn.execute("SELECT at,buffered FROM collector_health").fetchone()
        recent = store.query(conn, limit=8)
        latest = conn.execute("""
            SELECT id FROM sample WHERE classification IS NOT NULL ORDER BY captured_at DESC,id DESC LIMIT 1
        """).fetchone()
        state = {"lot": lot, "cursor": cursor, "recent": recent,
                 "latest": store.reading(conn, latest["id"]) if latest else None,
                 "collector": dict(health) if health else None, "environment": "bancada" if demo else "producao"}
        if lot:
            state["sequence_gap"] = conn.execute("SELECT count(*) FROM line_incident WHERE lot_id=?", (lot["id"],)).fetchone()[0]
            state["counts"] = dict(conn.execute("""
                SELECT count(classification) AS valid, count(CASE WHEN classification='nao_conforme' THEN 1 END) AS nonconforming,
                       count(failure) AS failed FROM sample WHERE lot_id=?
            """, (lot["id"],)).fetchone())
        return state


@router.get("/dashboard/changes")
async def changes(request: Request, store: Store, actor: Reader, after: int = Query(ge=0)):
    def read():
        with store.connection() as conn:
            return store.query(conn, after=after)

    for _ in range(20):
        rows = await run_in_threadpool(read)
        if rows or await request.is_disconnected():
            return {"items": rows, "cursor": rows[-1]["id"] if rows else after}
        await asyncio.sleep(0.2)
    return {"items": [], "cursor": after}


@router.post("/dashboard/rendered", status_code=204)
def rendered(data: Rendered, store: Store, actor: Reader):
    if abs((datetime.now(timezone.utc) - data.rendered_at).total_seconds()) > 15:
        raise HTTPException(422, "Verifique a sincronização do relógio do dispositivo.")
    with store.connection(write=True) as conn:
        reading = store.reading(conn, data.sample_id)
        if reading is None or reading["captured_at"] is None:
            raise HTTPException(404, "Leitura não encontrada.")
        value_ms = round((data.rendered_at - datetime.fromisoformat(reading["captured_at"])).total_seconds() * 1000)
        audit(conn, "leitura_renderizada", actor, detail=json.dumps({"sample_id": data.sample_id, "capture_to_view_ms": value_ms}))


@router.get("/readings")
def readings(store: Store, actor: Analyst, filters: Annotated[ReadingFilters, Query()]):
    with store.connection() as conn:
        conn.execute("BEGIN")
        ceiling = filters.ceiling
        if ceiling is None:
            ceiling = conn.execute("SELECT coalesce(max(id),0) FROM sample").fetchone()[0]
        rows = store.query(conn, filters.sql(), ceiling=ceiling, before=filters.before, limit=101)
        return {"items": rows[:100], "next": rows[99]["id"] if len(rows) > 100 else None, "ceiling": ceiling}


@router.get("/trends")
def trends(store: Store, actor: Reader, filters: Annotated[Filters, Query()]):
    clauses, params = filters_sql(filters.sql())
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with store.connection() as conn:
        rows = conn.execute("""
            SELECT substr(coalesce(s.captured_at,s.observed_at),1,10) AS day, l.order_number,
                count(s.classification) AS valid, sum(s.classification IS 'nao_conforme') AS nonconforming,
                sum(s.failure IS NOT NULL) AS failed
            FROM sample s JOIN lot l ON l.id=s.lot_id
        """ + where + " GROUP BY day,l.order_number ORDER BY day DESC,l.order_number", params)
        return {"items": [dict(row) for row in rows]}


@router.get("/readings/{sample_id}/image/{view}")
def image(sample_id: int, view: Literal["left", "right"], store: Store, actor: Analyst):
    with store.connection() as conn:
        row = conn.execute(f"SELECT {view}_image,{view}_type FROM capture WHERE sample_id=?", (sample_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Imagem inexistente.")
        return Response(row[0], media_type=row[1], headers={"Cache-Control": "no-store"})


@router.get("/audit")
def query_audit(store: Store, actor: Auditor, before: int = Query(2**63 - 1, gt=0)):
    with store.connection() as conn:
        rows = conn.execute("""
            SELECT a.*, u.badge FROM audit a LEFT JOIN audit_actor actor ON actor.audit_id=a.id
            LEFT JOIN account u ON actor.account_id=u.id WHERE a.id < ? ORDER BY a.id DESC LIMIT 51
        """, (before,)).fetchall()
        return {"items": [dict(row) for row in rows[:50]], "next": rows[49]["id"] if len(rows) > 50 else None}


REPORT_COLUMNS = ("ID", "OP", "Produto", "Amostra", "Data UTC", "Largura mm", "Flecha mm",
                  "Classificação", "Falha", "Versão", "Calibração")


def report_rows(rows):
    for row in rows:
        label = {"conforme": "Conforme", "nao_conforme": "Não conforme"}
        cells = (row["id"], row["order_number"], row["product"], row["sequence"],
                 row["captured_at"] or row["observed_at"], f"{row['width_um'] / 1000:.3f}",
                 f"{row['deflection_um'] / 1000:.3f}" if row["deflection_um"] is not None else "",
                 label.get(row["classification"], ""), row["failure"] or "", row["version"], row["calibration_id"])
        yield tuple(str(cell) for cell in cells)


def report_file(rows, format):
    cells = list(report_rows(rows))
    if format == "csv":
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(REPORT_COLUMNS)
        writer.writerows([("'" + value if value.lstrip()[:1] in ("=", "+", "-", "@") or value[:1] in ("\t", "\r", "\n") else value)
                          for value in row] for row in cells)
        return stream.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8"
    pages = []
    for offset in range(0, max(len(cells), 1), 20):
        page = Image.new("1", (1000, 760), "white")
        draw = ImageDraw.Draw(page)
        draw.text((32, 28), "Abaulytics | Relatório de produção", fill="black", font_size=21)
        draw.text((32, 58), f"{len(cells)} amostras | Página {len(pages) + 1}", fill="black", font_size=14)
        for i, row in enumerate(cells[offset:offset + 20]):
            y = 90 + i * 32
            draw.text((32, y), f"#{row[0]} | OP {row[1]} | Chapa {row[3]} | {row[4]} | {row[6]} mm {row[7]} {row[8]}",
                      fill="black", font_size=13)
            draw.text((32, y + 14), f"Produto {row[2][:80]} | Largura {row[5]} mm | {row[9]} / {row[10]}",
                      fill="black", font_size=11)
        pages.append(page)
    stream = io.BytesIO()
    pages[0].save(stream, "PDF", save_all=True, append_images=pages[1:])
    return stream.getvalue(), "application/pdf"


@router.post("/reports")
def report(data: ReportRequest, store: Store, actor: Analyst):
    if not reports.acquire(blocking=False):
        raise HTTPException(503, "Há uma exportação em andamento.")
    try:
        filters = data.sql()
        with store.connection() as conn:
            rows = store.query(conn, filters, ceiling=data.ceiling, limit=-1)
        content, kind = report_file(rows, data.format)
        with store.connection(write=True) as conn:
            report_id = conn.execute("""
                INSERT INTO report(format,filters,at,sample_cursor,row_count,content) VALUES (?,?,?,?,?,?)
            """, (data.format, json.dumps(filters, ensure_ascii=False), utc(), data.ceiling, len(rows), content)).lastrowid
            conn.execute("INSERT INTO report_author VALUES (?,?)", (report_id, actor["id"]))
            audit(conn, "relatorio_gerado", actor, detail=str(report_id))
        return Response(content, media_type=kind, headers={
            "Content-Disposition": f'attachment; filename="abaulytics-{report_id}.{data.format}"',
            "Cache-Control": "no-store",
        })
    finally:
        reports.release()
