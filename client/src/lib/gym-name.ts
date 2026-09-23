import { createContext, useContext } from "react";

export const GymNameContext = createContext<string>("GymDesk");

export function useGymName(): string {
  return useContext(GymNameContext);
}