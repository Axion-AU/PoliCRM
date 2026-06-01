import { useState } from "react";

export function useWarRoom() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  return { selectedRegion, setSelectedRegion };
}
