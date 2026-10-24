import { z } from 'zod';

export const AwsLandingTokenSchema = z.object({
  token: z
    .string({ required_error: 'AWS Marketplace registration token is required' })
    .min(1, 'Token cannot be empty'),
});

export const AwsActivateSchema = z.object({
  customerAccountId: z
    .string({ required_error: 'AWS Customer Account ID is required' })
    .min(1, 'Customer Account ID cannot be empty'),
  productCode: z
    .string({ required_error: 'AWS Product Code is required' })
    .min(1, 'Product Code cannot be empty'),
  licenseArn: z.string().optional(),
  agreementId: z.string().optional(),
  customerIdentifier: z.string().optional(), // Legacy support
  dimension: z.string().optional(),
  quantity: z.number().int().positive().optional().default(1),
  newAdmin: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().email('Invalid email address'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
    })
    .optional(),
});

export const AwsEventBridgeEnvelopeSchema = z.object({
  version: z.string().optional().default('0'),
  id: z.string().min(1, 'EventBridge message id is required'),
  'detail-type': z.string().min(1, 'detail-type is required'),
  source: z.string().min(1, 'source is required'),
  account: z.string().optional().default(''),
  time: z.string().optional().default(''),
  region: z.string().optional().default(''),
  resources: z.array(z.string()).optional().default([]),
  detail: z
    .object({
      requestId: z.string().optional(),
      catalog: z.string().optional(),
      agreementId: z.string().optional(),
      licenseArn: z.string().optional(),
      productCode: z.string().optional(),
      customerAwsAccountId: z.string().optional(),
      agreementStatus: z.string().optional(),
      advisoryType: z.string().optional(),
    })
    .passthrough(),
});

export type AwsLandingTokenInput = z.infer<typeof AwsLandingTokenSchema>;
export type AwsActivateInput = z.infer<typeof AwsActivateSchema>;
export type AwsEventBridgeEnvelopeInput = z.infer<typeof AwsEventBridgeEnvelopeSchema>;
