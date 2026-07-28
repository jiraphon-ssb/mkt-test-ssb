import { createContext, useContext, useMemo, useState } from "react";
import {
  ENTITIES,
  BRANDS,
  DEFAULT_CONTEXT,
  resolveContext,
} from "./orgConfig.js";

/* EntityContext — holds WHICH legal entity / brand the user is currently
   viewing. Lives at the shell; flows down to every module. Modules read the
   context and filter their own data — they must never render their own
   context-switching UI (กติกาเหล็ก #3). */

const EntityCtx = createContext(null);

export function EntityProvider({ children }) {
  const [ctx, setCtx] = useState(DEFAULT_CONTEXT);

  const value = useMemo(() => {
    const resolved = resolveContext(ctx);
    return {
      ctx, // { kind: "entity" | "brand", key }
      setCtx, // (next) => void
      entities: ENTITIES,
      brands: BRANDS,
      ...resolved, // { label, sub, isEntity }
    };
  }, [ctx]);

  return <EntityCtx.Provider value={value}>{children}</EntityCtx.Provider>;
}

/** Read the current entity/brand context anywhere below the shell. */
export function useEntityContext() {
  const v = useContext(EntityCtx);
  if (!v) throw new Error("useEntityContext must be used within <EntityProvider>");
  return v;
}
