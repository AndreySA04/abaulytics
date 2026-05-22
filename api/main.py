import os
import cv2
import numpy as np
import sqlite3
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    conn = sqlite3.connect('medicoes.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS medicoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_hora TEXT,
            abaulamento_px REAL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.post("/api/analisar-chapa")
async def analisar_chapa(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"erro": "Imagem inválida."}
        
        # 1. CORTE DA REGIÃO (ROI) - Joga fora o teto, a mesa e as bordas
        (h_orig, w_orig) = img.shape[:2]
        
        # Corta a vertical (Teto e Chão)
        y_start = int(h_orig * 0.3)
        y_end = int(h_orig * 0.7)
        
        # Corta a horizontal (Margem de segurança para ignorar sombras nas pontas)
        # 0.05 significa ignorar 5% de cada lado. Se precisar ignorar mais, mude para 0.10 (10%)
        x_start = int(w_orig * 0.05) 
        x_end = int(w_orig * 0.95)
        
        # A partir daqui, o algoritmo SÓ enxerga o retângulo ultra-seguro do meio
        img_roi = img[y_start:y_end, x_start:x_end]
        
        # 1. PREPARAÇÃO DA IMAGEM
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Binarização Otsu: Separa o papelão do fundo automaticamente
        # Pressupõe que o fundo é claro e o papelão é escuro (ou vice-versa)
        # O papelão se tornará branco (255) e o fundo preto (0) na matriz 'thresh'
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Remove sujeiras soltas (ruído) acima do papelão
        kernel = np.ones((5, 5), np.uint8)
        thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        # 2. VARREDURA DE SUPERFÍCIE (ALTA PRECISÃO)
        # Para cada coluna X, encontra a primeira linha Y (de cima pra baixo) que tem um pixel do papelão
        
        # Encontra o índice (Y) do primeiro valor máximo (255) em cada coluna
        y_coords = np.argmax(thresh_clean, axis=0)
        
        # Verifica quais colunas realmente possuem papelão
        colunas_validas = np.max(thresh_clean, axis=0) > 0

        # Monta os arrays finais contendo apenas os pixels da borda superior exata
        x_linha = np.where(colunas_validas)[0]
        y_linha = y_coords[colunas_validas]

        if len(x_linha) < 50:
             # Salva o debug do erro
             os.makedirs("debug", exist_ok=True)
             cv2.imwrite("debug/erro_binarizacao.jpg", thresh_clean)
             return {"erro": "Não foi possível extrair a linha de perfil. Verifique o fundo da imagem."}

        # 3. CÁLCULO DE ABAULAMENTO: PICO AO VALE (AMPLITUDE TOTAL)
        # Em imagens digitais (OpenCV), o eixo Y cresce de cima para baixo.
        # Portanto:
        # Menor Y = Ponto Fisicamente Mais Alto (PICO)
        # Maior Y = Ponto Fisicamente Mais Baixo (VALE)

        y_min_idx = np.argmin(y_linha) # Índice do PICO
        y_max_idx = np.argmax(y_linha) # Índice do VALE

        pico_x, pico_y = int(x_linha[y_min_idx]), int(y_linha[y_min_idx])
        vale_x, vale_y = int(x_linha[y_max_idx]), int(y_linha[y_max_idx])

        # A distância em pixels é a diferença absoluta no eixo Y
        abaulamento_maximo_px = float(abs(vale_y - pico_y))

        # Conversão para Milímetros (usando a largura real da chapa)
        LARGURA_REAL_MM = 500.0 # <-- Substitua pelo tamanho da sua chapa
        
        # A largura na foto é a distância do primeiro ao último X da linha lida
        largura_px = float(x_linha[-1] - x_linha[0])
        
        if largura_px <= 0:
             return {"erro": "Falha na leitura da largura da chapa."}

        fator_conversao = LARGURA_REAL_MM / largura_px
        abaulamento_mm = round(abaulamento_maximo_px * fator_conversao, 2)
        
        print(f"Sucesso: Abaulamento (Pico a Vale) calculado: {abaulamento_mm} mm")

        # 4. SALVAR NO BANCO DE DADOS
        conn = sqlite3.connect('medicoes.db')
        # ...
        # 4. SALVAR NO BANCO DE DADOS
        conn = sqlite3.connect('medicoes.db')
        cursor = conn.cursor()
        data_atual = datetime.now().isoformat()
        cursor.execute('INSERT INTO medicoes (data_hora, abaulamento_px) VALUES (?, ?)', (data_atual, abaulamento_maximo_px))
        conn.commit()
        id_inserido = cursor.lastrowid
        conn.close()

        # 5. GERAR DEBUG VISUAL (Pico a Vale)
        # Desenha a linha verde do perfil
        for i in range(len(x_linha) - 1):
            pt1 = (int(x_linha[i]), int(y_linha[i]))
            pt2 = (int(x_linha[i+1]), int(y_linha[i+1]))
            cv2.line(img, pt1, pt2, (0, 255, 0), 2)

        # Marca o Pico (Azul) e desenha sua linha horizontal
        cv2.circle(img, (pico_x, pico_y), 6, (255, 0, 0), -1)
        cv2.line(img, (0, pico_y), (img.shape[1], pico_y), (255, 0, 0), 1) # Linha horizontal
        cv2.putText(img, "Pico", (pico_x + 10, pico_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

        # Marca o Vale (Vermelho) e desenha sua linha horizontal
        cv2.circle(img, (vale_x, vale_y), 6, (0, 0, 255), -1)
        cv2.line(img, (0, vale_y), (img.shape[1], vale_y), (0, 0, 255), 1) # Linha horizontal
        cv2.putText(img, "Vale", (vale_x + 10, vale_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

        # Desenha a linha de medição vertical entre eles
        x_meio = int(img.shape[1] / 2)
        cv2.line(img, (x_meio, pico_y), (x_meio, vale_y), (0, 255, 255), 2)
        cv2.putText(img, f"Distancia: {abaulamento_mm}mm", (x_meio + 10, int((pico_y + vale_y)/2)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        os.makedirs("debug", exist_ok=True)
        cv2.imwrite(f"debug/medicao_picovale_{id_inserido}.jpg", img)

        return {
            "status": "sucesso",
            "id_medicao": id_inserido,
            "data": data_atual,
            "abaulamento_px": abaulamento_maximo_px,
        }

    except Exception as e:
        return {"erro": f"Falha no processamento: {str(e)}"}