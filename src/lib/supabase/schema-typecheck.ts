import type { GenericSchema } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Assert<T extends true> = T;

type PublicSchemaIsValid = Database["public"] extends GenericSchema ? true : false;
type PublicSchemaAssertion = Assert<PublicSchemaIsValid>;

export type { PublicSchemaAssertion };
