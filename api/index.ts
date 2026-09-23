export default function handler(req: any, res: any) {
  res.status(200).json({
    status: "ok",
    url: req.url,
    originalUrl: req.originalUrl,
    time: new Date().toISOString(),
  });
}
