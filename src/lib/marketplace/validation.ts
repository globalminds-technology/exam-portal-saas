import { z } from 'zod';

export const ResolveTokenSchema = z.object({
  token: z
    .string({ required_error: 'Marketplace purchase token is required' })
    .min(10, 'Invalid token length'),
});

export const ActivateSubscriptionSchema = z.object({
  subscriptionId: z
    .string({ required_error: 'Subscription ID is required' })
    .uuid('Subscription ID must be a valid UUID'),
  planId: z.string({ required_error: 'Plan ID is required' }).min(1),
  quantity: z.number().int().positive().optional().default(1),
  // Optional admin provisioning fields if user is registering on activation
  newAdmin: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().email('Invalid email address'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
    })
    .optional(),
});

export const MarketplaceWebhookSchema = z.object({
  id: z.string({ required_error: 'Operation ID is required' }),
  activityId: z.string().optional(),
  subscriptionId: z.string({ required_error: 'Subscription ID is required' }),
  offerId: z.string().optional(),
  publisherId: z.string().optional(),
  planId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  action: z.enum([
    'Unsubscribe',
    'ChangePlan',
    'ChangeQuantity',
    'Suspend',
    'Reinstate',
    'Renew',
  ]),
  timeStamp: z.string({ required_error: 'Timestamp is required' }),
  status: z.string({ required_error: 'Status is required' }),
});

export type ResolveTokenInput = z.infer<typeof ResolveTokenSchema>;
export type ActivateSubscriptionInput = z.infer<typeof ActivateSubscriptionSchema>;
export type MarketplaceWebhookInput = z.infer<typeof MarketplaceWebhookSchema>;
