export function trackEvent(eventName, payload = {}) {
  try {
    if (window.gtag) {
      window.gtag("event", eventName, payload);
    }

    if (window.dataLayer) {
      window.dataLayer.push({
        event: eventName,
        ...payload,
      });
    }

    console.log("Analytics event:", eventName, payload);
  } catch (err) {
    console.error("Analytics tracking failed:", err);
  }
}

