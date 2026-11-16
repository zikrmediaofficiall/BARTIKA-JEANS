export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          counted_cash: number | null
          expected_cash: number | null
          id: string
          opened_at: string
          opening_cash: number
          seller_id: string
          status: string
          variance: number | null
        }
        Insert: {
          closed_at?: string | null
          counted_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          seller_id: string
          status?: string
          variance?: number | null
        }
        Update: {
          closed_at?: string | null
          counted_cash?: number | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          seller_id?: string
          status?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_accounts: {
        Row: {
          credit_limit: number
          customer_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          credit_limit?: number
          customer_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          credit_limit?: number
          customer_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exchange_items: {
        Row: {
          exchange_id: string
          id: string
          original_sale_item_id: string | null
          quantity: number
          replacement_variant_id: string | null
          returned_variant_id: string
        }
        Insert: {
          exchange_id: string
          id?: string
          original_sale_item_id?: string | null
          quantity: number
          replacement_variant_id?: string | null
          returned_variant_id: string
        }
        Update: {
          exchange_id?: string
          id?: string
          original_sale_item_id?: string | null
          quantity?: number
          replacement_variant_id?: string | null
          returned_variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_items_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_original_sale_item_id_fkey"
            columns: ["original_sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_replacement_variant_id_fkey"
            columns: ["replacement_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_replacement_variant_id_fkey"
            columns: ["replacement_variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "exchange_items_returned_variant_id_fkey"
            columns: ["returned_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_returned_variant_id_fkey"
            columns: ["returned_variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      exchange_settlements: {
        Row: {
          amount: number
          cash_session_id: string | null
          created_at: string
          created_by: string
          direction: string
          exchange_id: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          created_at?: string
          created_by: string
          direction: string
          exchange_id: string
          id?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          direction?: string
          exchange_id?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_settlements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_settlements_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
        ]
      }
      exchanges: {
        Row: {
          created_at: string
          created_by: string | null
          exchange_type: string
          id: string
          original_sale_id: string
          price_difference: number
          reason: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exchange_type?: string
          id?: string
          original_sale_id: string
          price_difference?: number
          reason: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exchange_type?: string
          id?: string
          original_sale_id?: string
          price_difference?: number
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchanges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchanges_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          cash_session_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      manager_permissions: {
        Row: {
          created_at: string
          granted_by: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cash_session_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost_price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          cost_price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "seller_catalog"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string
          color: string | null
          created_at: string
          id: string
          product_id: string
          size: string | null
        }
        Insert: {
          barcode: string
          color?: string | null
          created_at?: string
          id?: string
          product_id: string
          size?: string | null
        }
        Update: {
          barcode?: string
          color?: string | null
          created_at?: string
          id?: string
          product_id?: string
          size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          id: string
          image_public_id: string | null
          image_url: string | null
          is_active: boolean
          name: string
          sale_price: number
          sku: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          is_active?: boolean
          name: string
          sale_price: number
          sku: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          is_active?: boolean
          name?: string
          sale_price?: number
          sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          max_discount_percent: number
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          max_discount_percent?: number
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          max_discount_percent?: number
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          due: number
          id: string
          invoice_reference: string | null
          paid: number
          status: string
          subtotal: number
          supplier_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due?: number
          id?: string
          invoice_reference?: string | null
          paid?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due?: number
          id?: string
          invoice_reference?: string | null
          paid?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          id: string
          purchase_id: string
          quantity: number
          unit_cost: number
          variant_id: string
        }
        Insert: {
          id?: string
          purchase_id: string
          quantity: number
          unit_cost: number
          variant_id: string
        }
        Update: {
          id?: string
          purchase_id?: string
          quantity?: number
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sale_item_costs: {
        Row: {
          sale_item_id: string
          unit_cost_snapshot: number
        }
        Insert: {
          sale_item_id: string
          unit_cost_snapshot: number
        }
        Update: {
          sale_item_id?: string
          unit_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_costs_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: true
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          barcode_snapshot: string
          discount_amount: number
          id: string
          line_total: number
          product_name_snapshot: string
          quantity: number
          sale_id: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode_snapshot: string
          discount_amount?: number
          id?: string
          line_total: number
          product_name_snapshot: string
          quantity: number
          sale_id: string
          unit_price: number
          variant_id: string
        }
        Update: {
          barcode_snapshot?: string
          discount_amount?: number
          id?: string
          line_total?: number
          product_name_snapshot?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_session_id: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          discount_percent: number
          due: number
          id: string
          idempotency_key: string
          invoice_number: number
          paid: number
          seller_id: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
        }
        Insert: {
          cash_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_percent?: number
          due?: number
          id?: string
          idempotency_key: string
          invoice_number?: never
          paid?: number
          seller_id: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_percent?: number
          due?: number
          id?: string
          idempotency_key?: string
          invoice_number?: never
          paid?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity_delta: number
          reason: string
          reference_id: string | null
          variant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          quantity_delta: number
          reason?: string
          reference_id?: string | null
          variant_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          quantity_delta?: number
          reason?: string
          reference_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          actual_quantity: number
          id: string
          reason: string | null
          stocktake_id: string
          system_quantity: number
          variant_id: string
        }
        Insert: {
          actual_quantity: number
          id?: string
          reason?: string | null
          stocktake_id: string
          system_quantity: number
          variant_id: string
        }
        Update: {
          actual_quantity?: number
          id?: string
          reason?: string | null
          stocktake_id?: string
          system_quantity?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "seller_catalog"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          exchange_days: number
          facebook_url: string | null
          id: number
          instagram_url: string | null
          instapay_ipa: string | null
          instapay_url: string | null
          logo_url: string | null
          phone: string | null
          quick_discount_percent: number
          store_name: string
          store_name_ar: string
          tiktok_url: string | null
          whatsapp_url: string | null
        }
        Insert: {
          address?: string | null
          exchange_days?: number
          facebook_url?: string | null
          id?: number
          instagram_url?: string | null
          instapay_ipa?: string | null
          instapay_url?: string | null
          logo_url?: string | null
          phone?: string | null
          quick_discount_percent?: number
          store_name?: string
          store_name_ar?: string
          tiktok_url?: string | null
          whatsapp_url?: string | null
        }
        Update: {
          address?: string | null
          exchange_days?: number
          facebook_url?: string | null
          id?: number
          instagram_url?: string | null
          instapay_ipa?: string | null
          instapay_url?: string | null
          logo_url?: string | null
          phone?: string | null
          quick_discount_percent?: number
          store_name?: string
          store_name_ar?: string
          tiktok_url?: string | null
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          cash_session_id: string | null
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          purchase_invoice_id: string
          reference: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          purchase_invoice_id: string
          reference?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          purchase_invoice_id?: string
          reference?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      seller_catalog: {
        Row: {
          barcode: string | null
          category: string | null
          color: string | null
          product_id: string | null
          product_name: string | null
          sale_price: number | null
          size: string | null
          sku: string | null
          stock: number | null
          variant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_expense:
        | {
            Args: {
              p_amount: number
              p_category: string
              p_description: string
              p_method: Database["public"]["Enums"]["payment_method"]
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_cash_session_id: string
              p_category: string
              p_description: string
              p_method: Database["public"]["Enums"]["payment_method"]
            }
            Returns: string
          }
      add_product_with_variant: {
        Args: {
          p_barcode?: string
          p_category: string
          p_color?: string
          p_cost_price: number
          p_name: string
          p_opening_quantity?: number
          p_sale_price: number
          p_size?: string
          p_sku: string
        }
        Returns: Json
      }
      add_product_with_variants: {
        Args: {
          p_category: string
          p_cost_price: number
          p_name: string
          p_sale_price: number
          p_sku: string
          p_variants: Json
        }
        Returns: Json
      }
      approve_stocktake: { Args: { p_stocktake_id: string }; Returns: Json }
      close_cash_session: {
        Args: { p_counted_cash: number; p_session_id: string }
        Returns: Json
      }
      collect_sale_due: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference: string
          p_sale_id: string
        }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_customer_phone?: string
          p_discount_percent?: number
          p_idempotency_key: string
          p_items: Json
          p_payments: Json
        }
        Returns: Json
      }
      get_financial_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      open_cash_session: { Args: { p_opening_cash?: number }; Returns: string }
      process_sale_exchange: {
        Args: {
          p_exchange_type: string
          p_items: Json
          p_original_sale_id: string
          p_reason: string
          p_settlement_method?: Database["public"]["Enums"]["payment_method"]
          p_settlement_reference?: string
        }
        Returns: Json
      }
      receive_purchase: {
        Args: {
          p_items: Json
          p_paid?: number
          p_reference: string
          p_supplier_id: string
        }
        Returns: Json
      }
      record_supplier_payment: {
        Args: {
          p_amount: number
          p_cash_session_id: string
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_purchase_invoice_id: string
          p_reference: string
        }
        Returns: Json
      }
      set_manager_permissions: {
        Args: { p_manager_id: string; p_permission_keys: string[] }
        Returns: Json
      }
      set_stocktake_count: {
        Args: {
          p_actual_quantity: number
          p_reason?: string
          p_stocktake_id: string
          p_variant_id: string
        }
        Returns: undefined
      }
      start_stocktake: { Args: { p_notes?: string }; Returns: string }
      void_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "seller" | "manager"
      payment_method: "cash" | "instapay" | "visa"
      sale_status: "completed" | "void"
      stock_movement_type:
        | "opening"
        | "purchase"
        | "sale"
        | "exchange_in"
        | "exchange_out"
        | "damage"
        | "adjustment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "seller", "manager"],
      payment_method: ["cash", "instapay", "visa"],
      sale_status: ["completed", "void"],
      stock_movement_type: [
        "opening",
        "purchase",
        "sale",
        "exchange_in",
        "exchange_out",
        "damage",
        "adjustment",
      ],
    },
  },
} as const
