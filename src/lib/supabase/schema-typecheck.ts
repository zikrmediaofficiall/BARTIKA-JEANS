import type { Database } from "./database.types";

type GenericTableLike = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
};

type GenericViewLike = {
  Row: Record<string, unknown>;
};

type GenericFunctionLike = {
  Args: Record<string, unknown> | never;
  Returns: unknown;
};

type GenericSchemaLike = {
  Tables: Record<string, GenericTableLike>;
  Views: Record<string, GenericViewLike>;
  Functions: Record<string, GenericFunctionLike>;
};

type Assert<T extends true> = T;
type PublicSchemaIsValid = Database["public"] extends GenericSchemaLike ? true : false;
type PublicSchemaAssertion = Assert<PublicSchemaIsValid>;

export type { PublicSchemaAssertion };
