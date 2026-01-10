import { Hono } from 'hono';
import type { Env } from '../types';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// ============================================
// Blink GraphQL Helper
// ============================================

/**
 * Make a GraphQL request to Blink API
 */
async function blinkGraphqlRequest(
  endpoint: string,
  apiKey: string,
  query: string,
  variables: Record<string, any> = {}
): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Blink GraphQL request failed: ${text}`);
  }

  const data = await response.json();

  if (data?.errors?.length) {
    throw new Error(data.errors.map((e: any) => e.message).join(', '));
  }

  return data?.data;
}

/**
 * Get BTC wallet ID from Blink
 */
async function getBlinkBtcWalletId(endpoint: string, apiKey: string): Promise<string> {
  const query = `
    query Me {
      me {
        defaultAccount {
          wallets {
            id
            walletCurrency
          }
        }
      }
    }
  `;

  const result = await blinkGraphqlRequest(endpoint, apiKey, query);
  const wallets = result?.me?.defaultAccount?.wallets || [];
  const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');

  if (!btcWallet?.id) {
    throw new Error('BTC wallet not found');
  }

  return btcWallet.id;
}

/**
 * Get wallet balance
 */
async function getBlinkWalletBalance(endpoint: string, apiKey: string): Promise<number> {
  try {
    const query = `
      query Me {
        me {
          defaultAccount {
            wallets {
              id
              walletCurrency
              balance
            }
          }
        }
      }
    `;

    const result = await blinkGraphqlRequest(endpoint, apiKey, query);
    const wallets = result?.me?.defaultAccount?.wallets || [];
    const btcWallet = wallets.find((w: any) => w.walletCurrency === 'BTC');

    return Number(btcWallet?.balance || 0);
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    return 0;
  }
}

/**
 * Create Lightning invoice
 */
async function createBlinkInvoice(
  endpoint: string,
  apiKey: string,
  params: { sats: number; memo: string }
): Promise<string> {
  const walletId = await getBlinkBtcWalletId(endpoint, apiKey);

  const mutation = `
    mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
      lnInvoiceCreate(input: $input) {
        invoice {
          paymentRequest
          paymentHash
          satoshis
        }
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      walletId,
      amount: params.sats,
      memo: params.memo || 'Citadel POW Donation',
    },
  };

  const result = await blinkGraphqlRequest(endpoint, apiKey, mutation, variables);
  const payload = result?.lnInvoiceCreate;

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Failed to create invoice');
  }

  const invoice = payload?.invoice?.paymentRequest;

  if (!invoice) {
    throw new Error('Invalid invoice response');
  }

  return invoice;
}

/**
 * Check invoice status
 */
async function checkInvoiceStatus(
  endpoint: string,
  apiKey: string,
  paymentHash: string
): Promise<{ paid: boolean; confirmedAt?: string }> {
  const query = `
    query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
      lnInvoicePaymentStatus(input: $input) {
        status
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      paymentHash,
    },
  };

  const result = await blinkGraphqlRequest(endpoint, apiKey, query, variables);
  const payload = result?.lnInvoicePaymentStatus;

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Failed to check invoice status');
  }

  const status = payload?.status;
  const paid = status === 'PAID';

  return {
    paid,
    confirmedAt: paid ? new Date().toISOString() : undefined,
  };
}

// ============================================
// API Endpoints
// ============================================

/**
 * POST /api/blink/create-invoice
 * Create a Lightning invoice
 */
const createInvoiceSchema = z.object({
  amount: z.number().int().positive(),
  memo: z.string().optional(),
});

app.post('/create-invoice', async (c) => {
  try {
    if (!c.env.BLINK_API_ENDPOINT || !c.env.BLINK_API_KEY) {
      return c.json({ error: 'Blink API not configured' }, 501);
    }

    const body = await c.req.json();
    const validated = createInvoiceSchema.parse(body);

    const invoice = await createBlinkInvoice(
      c.env.BLINK_API_ENDPOINT,
      c.env.BLINK_API_KEY,
      {
        sats: validated.amount,
        memo: validated.memo || 'Citadel POW Donation',
      }
    );

    return c.json({
      success: true,
      data: {
        invoice,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Create invoice error:', error);
    return c.json({ error: (error as Error).message || 'Failed to create invoice' }, 500);
  }
});

/**
 * POST /api/blink/check-invoice
 * Check invoice payment status
 */
const checkInvoiceSchema = z.object({
  paymentHash: z.string(),
});

app.post('/check-invoice', async (c) => {
  try {
    if (!c.env.BLINK_API_ENDPOINT || !c.env.BLINK_API_KEY) {
      return c.json({ error: 'Blink API not configured' }, 501);
    }

    const body = await c.req.json();
    const validated = checkInvoiceSchema.parse(body);

    const status = await checkInvoiceStatus(
      c.env.BLINK_API_ENDPOINT,
      c.env.BLINK_API_KEY,
      validated.paymentHash
    );

    return c.json({
      success: true,
      data: status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request', details: error.errors }, 400);
    }
    console.error('Check invoice error:', error);
    return c.json({ error: (error as Error).message || 'Failed to check invoice' }, 500);
  }
});

/**
 * GET /api/blink/wallet-balance
 * Get current wallet balance
 */
app.get('/wallet-balance', async (c) => {
  try {
    if (!c.env.BLINK_API_ENDPOINT || !c.env.BLINK_API_KEY) {
      return c.json({ error: 'Blink API not configured' }, 501);
    }

    const balance = await getBlinkWalletBalance(
      c.env.BLINK_API_ENDPOINT,
      c.env.BLINK_API_KEY
    );

    return c.json({
      success: true,
      data: {
        balance,
      },
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    return c.json({ error: (error as Error).message || 'Failed to get balance' }, 500);
  }
});

/**
 * POST /api/blink/webhook
 * Handle Blink webhook notifications
 */
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Blink webhook received:', JSON.stringify(body, null, 2));

    // TODO: Process webhook event
    // This can be used to automatically update donation status

    return c.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

export default app;
