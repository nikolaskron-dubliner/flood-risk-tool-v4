export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    console.log("Incoming data:", body);

    return res.status(200).json({ message: "Received successfully" });

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}