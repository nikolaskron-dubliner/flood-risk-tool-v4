function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((body) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

function createSupabaseMock({ rows = [], candidates = [], updates = [] } = {}) {
  return {
    from: jest.fn(() => {
      const state = { audit: false, updatePayload: null };
      const chain = {
        select: jest.fn((fields) => {
          state.audit = String(fields || "").includes("nurture_last_sent_at");
          return chain;
        }),
        in: jest.fn(() => chain),
        lte: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        or: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(async () => ({
          data: state.audit ? candidates : rows,
          error: null,
        })),
        update: jest.fn((payload) => {
          state.updatePayload = payload;
          return chain;
        }),
        single: jest.fn(async () => ({
          data: { id: "lead-1", ...state.updatePayload },
          error: null,
        })),
        then: undefined,
      };

      chain.eq.mockImplementation(() => {
        if (state.updatePayload) {
          updates.push(state.updatePayload);
          return Promise.resolve({ error: null });
        }
        return chain;
      });

      return chain;
    }),
  };
}

async function loadHandler({ rows, candidates, sendResult }) {
  jest.resetModules();
  process.env.NURTURE_PROCESS_SECRET = "test-secret";
  process.env.ALERT_FROM_EMAIL = "alerts@example.com";

  const updates = [];
  const send = jest.fn(async () => sendResult || { data: { id: "email-1" } });
  const supabase = createSupabaseMock({ rows, candidates, updates });

  jest.doMock("../api/_lib/supabase", () => ({
    __esModule: true,
    default: supabase,
  }));
  jest.doMock("../api/_lib/resend", () => ({
    createResendClient: () => ({ emails: { send } }),
  }));

  const mod = await import("../api/nurture/process");
  return { handler: mod.default, send, updates };
}

afterEach(() => {
  jest.dontMock("../api/_lib/supabase");
  jest.dontMock("../api/_lib/resend");
  jest.resetModules();
});

test("nurture processor sends due email and marks the row sent", async () => {
  const { handler, send, updates } = await loadHandler({
    rows: [
      {
        id: "lead-1",
        email: "nurture@example.com",
        callback_requested: false,
        nurture_type: "low",
        nurture_step: 0,
        risk_score: 35,
      },
    ],
  });

  const req = {
    method: "GET",
    headers: {},
    query: { secret: "test-secret" },
    body: null,
  };
  const res = createResponse();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(updates[0]).toMatchObject({
    email_status: "sent",
    email_error: null,
    nurture_status: "active",
    nurture_step: 1,
  });
});

test("nurture audit reports completed leads that are not queued for follow-up", async () => {
  const { handler } = await loadHandler({
    candidates: [
      {
        id: "lead-1",
        email: "stale@example.com",
        stage: "completed",
        callback_requested: false,
        nurture_status: "not_enrolled",
        email_unsubscribed: false,
      },
    ],
  });

  const req = {
    method: "GET",
    headers: {},
    query: { secret: "test-secret", audit: "stale" },
    body: null,
  };
  const res = createResponse();

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({
    ok: true,
    audit: "stale",
    count: 1,
  });
  expect(res.body.rows[0].email).toBe("stale@example.com");
});
