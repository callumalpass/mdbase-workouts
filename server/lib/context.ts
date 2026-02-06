import type { Collection } from "@callumalpass/mdbase";

declare module "hono" {
  interface ContextVariableMap {
    db: Collection;
  }
}
