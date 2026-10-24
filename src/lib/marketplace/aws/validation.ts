import { z } from 'zod';

export const AwsLandingTokenSchema = z.object({
  token: z
    .string({ required_error: 'AWS Marketplace registration token is required' })
    .min(1, 'Token cannot be empty'),
});

export const AwsActivateSchema = z.object({
  customerIdentifier: z
    .string({ required_error: 'AWS Customer Identifier is required' })
    .min(1, 'Customer Identifier cannot be empty'),
  productCode: z
    .string({ required_error: 'AWS Product Code is required' })
    .min(1, 'Product Code cannot be empty'),
  customerAccountId: z.string().optional(),
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

export const AwsSnsEnvelopeSchema = z.object({
  Type: z.enum(['SubscriptionConfirmation', 'Notification', 'UnsubscribeConfirmation']),
  MessageId: z.string().min(1),
  Token: z.string().optional(),
  TopicArn: z.string().min(1),
  Subject: z.string().optional(),
  Message: z.string().min(1),
  Timestamp: z.string().min(1),
  SignatureVersion: z.string().min(1),
  Signature: z.string().min(1),
  SigningCertURL: z.string().url(),
  SubscribeURL: z.string().url().optional(),
  UnsubscribeURL: z.string().url().optional(),
});

export type AwsLandingTokenInput = z.infer<typeof AwsLandingTokenSchema>;
export type AwsActivateInput = z.infer<typeof AwsActivateSchema>;
export type AwsSnsEnvelopeInput = z.infer<typeof AwsSnsEnvelopeSchema>;
