import { View, Text, FlatList } from "react-native";
import { MeasurementRecord } from "../types/measurement";
import { FolderOpen } from "lucide-react-native";
import { MeasurementItem } from "./MeasurementItem";

interface MeasurementListProps {
  data: MeasurementRecord[];
}

export const MeasurementList = ({ data }: MeasurementListProps) => {
  if (data.length === 0) {
    return (
      <View className="flex-1 justify-center items-center mt-10">
        <FolderOpen size={48} color="#D1D5DB" />
        <Text className="mt-3 text-base text-gray-400">Nenhum registro encontrado.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MeasurementItem item={item} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    />
  );
};