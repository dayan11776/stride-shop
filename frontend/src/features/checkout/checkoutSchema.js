import { z } from 'zod'
// Validation shared by the checkout form (React Hook Form) and, ideally, the backend.
export const checkoutSchema = z.object({
  fullName: z.string().min(1, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(7, 'Enter a phone number'),
  line1: z.string().min(1, 'Enter your street address'),
  city: z.string().min(1, 'Enter your city'),
  postalCode: z.string().min(3, 'Enter a postal code'),
  shippingMethod: z.enum(['standard', 'express']),
  paymentMethod: z.enum(['card', 'ewallet', 'cod']),
})
