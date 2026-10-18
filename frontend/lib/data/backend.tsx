"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { DataBackend } from "@/server/backend";

const DataBackendContext = createContext<DataBackend | undefined>(undefined);

export function DataBackendProvider({
  backend,
  children,
}: Readonly<{ backend: DataBackend; children: ReactNode }>) {
  return (
    <DataBackendContext.Provider value={backend}>
      {children}
    </DataBackendContext.Provider>
  );
}

export function useDataBackend(): DataBackend {
  const backend = useContext(DataBackendContext);
  if (!backend) {
    throw new Error("useDataBackend must be used inside DataBackendProvider");
  }
  return backend;
}
