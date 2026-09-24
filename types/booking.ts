export type BookingStatus =
  | "pending"
  | "approved"
  | "alternative_proposed"
  | "declined"
  | "cancelled"
  | "confirmed";

export type PaymentStatus =
  | "not_requested"
  | "awaiting"
  | "paid"
  | "refunded";

export type BookingRequestRecord = {
  id: string;
  reference: string;
  created_at: string;
  updated_at: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  product_code: string;
  experience_title: string;
  option_code: string | null;
  option_name: string | null;
  requested_date: string;
  preferred_time: string | null;
  guests: number;
  unit_price: number | null;
  currency: string;
  estimated_total: number | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  pickup_location: string | null;
  language: string | null;
  customer_notes: string | null;
  admin_notes: string | null;
  alternative_date: string | null;
  alternative_time: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
};

export type CreateBookingRequestInput = {
  productCode: string;
  experienceTitle: string;
  optionCode: string;
  optionName: string;
  requestedDate: string;
  preferredTime: string;
  guests: number;
  unitPrice: number | null;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickupLocation: string;
  language: string;
  customerNotes: string;
};
