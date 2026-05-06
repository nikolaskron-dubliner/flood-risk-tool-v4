import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

function mockFetch({ initialLeadOk = true, retryLeadOk = true } = {}) {
  let leadCalls = 0;

  global.fetch = jest.fn(async (url) => {
    const target = String(url);

    if (target.includes("geo.fcc.gov")) {
      return {
        ok: true,
        json: async () => ({ County: { name: "Harris" } }),
      };
    }

    if (target.includes("/api/flood-risk-report")) {
      return {
        ok: true,
        json: async () => ({
          score: 35,
          tier: "Low",
          locationLabel: "Houston, TX",
          bullets: {
            geographic: "Localized runoff can affect this property.",
            historical: "Regional storms have caused past water issues.",
            climate: "Rainfall intensity may increase over time.",
          },
          financial: {
            annualRisk: "$1,800-$7,500",
            fiveYearNoAction: "$9,000-$37,500",
            propertyValueImpact: "-1% to -4%",
            insurancePremiumRange: "$900-$2,800/yr",
            narrative: "Mitigation and maintenance can reduce future exposure.",
          },
        }),
      };
    }

    if (target.includes("/api/lead/upsert")) {
      leadCalls += 1;
      const shouldSucceed = leadCalls === 1 ? initialLeadOk : retryLeadOk;
      return {
        ok: shouldSucceed,
        json: async () =>
          shouldSucceed
            ? { ok: true, id: "lead-test-id", nurture: { enrolled: true, type: "low" } }
            : { ok: false, error: "Supabase unavailable" },
      };
    }

    return {
      ok: false,
      json: async () => ({ error: "Unexpected URL" }),
    };
  });

  return {
    getLeadCalls: () => leadCalls,
  };
}

async function completeAssessment() {
  render(<App />);

  fireEvent.change(screen.getByPlaceholderText("Jane"), {
    target: { value: "Jane" },
  });
  fireEvent.change(screen.getByPlaceholderText("Smith"), {
    target: { value: "Tester" },
  });
  fireEvent.change(screen.getByPlaceholderText("jane@example.com"), {
    target: { value: "jane.tester@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

  fireEvent.change(screen.getByPlaceholderText("123 Main Street"), {
    target: { value: "123 Test Street" },
  });
  fireEvent.change(screen.getByPlaceholderText("Springfield"), {
    target: { value: "Houston" },
  });
  fireEvent.change(screen.getByPlaceholderText("IL"), {
    target: { value: "TX" },
  });
  fireEvent.change(screen.getByPlaceholderText("62701"), {
    target: { value: "77096" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. 1988"), {
    target: { value: "1990" },
  });

  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "Single Family Home" } });
  fireEvent.change(selects[1], { target: { value: "No basement" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

  fireEvent.click(document.querySelector('input[name="treesOverhang"][value="No"]'));
  fireEvent.click(document.querySelector('input[name="priorFloodDamage"][value="No"]'));
  fireEvent.click(document.querySelector('input[name="drainageIssues"][value="No"]'));
  fireEvent.click(document.querySelector('input[name="floodInsurance"][value="No"]'));
  fireEvent.click(screen.getByRole("button", { name: /Generate My Free Flood Risk Report/i }));

  await screen.findByText(/personalized property risk snapshot/i);
}

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

test("renders the flood risk assessment experience", () => {
  render(<App />);

  expect(
    screen.getByText(/Flood Risk Intelligence/i)
  ).toBeInTheDocument();

  expect(
    screen.getByRole("button", { name: /Continue/i })
  ).toBeInTheDocument();
});

test("shows a retry warning when the completed assessment cannot be saved", async () => {
  mockFetch({ initialLeadOk: false, retryLeadOk: true });
  await completeAssessment();

  expect(screen.getByText(/Follow-up save needed/i)).toBeInTheDocument();
  expect(screen.getByText(/Supabase unavailable/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Retry save/i }));

  await waitFor(() => {
    expect(screen.queryByText(/Follow-up save needed/i)).not.toBeInTheDocument();
  });
});

test("requires a phone number before converting a completed assessment to callback requested", async () => {
  const fetchState = mockFetch({ initialLeadOk: true });
  await completeAssessment();

  fireEvent.click(screen.getByRole("button", { name: /GET MY PERSONALIZED PLAN/i }));

  expect(
    screen.getByText(/Please enter a phone number so a specialist can call you/i)
  ).toBeInTheDocument();
  expect(fetchState.getLeadCalls()).toBe(1);
});
