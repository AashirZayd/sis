// Phase 2 V-07: auditing app/api directly loses the app/ path segment.
export async function GET(request: Request) {
  return new ImageResponse(<div>og</div>, { width: 1200, height: 630 });
}
