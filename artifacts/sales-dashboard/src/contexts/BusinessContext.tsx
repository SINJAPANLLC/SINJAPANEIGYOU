import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useListBusinesses } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

interface BusinessContextType {
  selectedBusinessId: number | null;
  setSelectedBusinessId: (id: number | null) => void;
  businesses: ReturnType<typeof useListBusinesses>["data"];
  isLoading: boolean;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
  
  const { data: businesses, isLoading } = useListBusinesses({
    query: {
      enabled: !!isSignedIn,
      queryKey: ["/api/businesses"]
    }
  });

  useEffect(() => {
    if (businesses && businesses.length > 0 && !selectedBusinessId) {
      setSelectedBusinessId(businesses[0].id);
    }
  }, [businesses, selectedBusinessId]);

  return (
    <BusinessContext.Provider value={{ selectedBusinessId, setSelectedBusinessId, businesses, isLoading }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }
  return context;
}
