import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.papiflix.app',
        sha256_cert_fingerprints: [
          'D3:89:0F:7F:6D:88:52:5A:99:AB:EF:F5:9C:93:C5:52:00:9B:05:67:7C:93:C1:89:1F:E5:14:2C:A6:EA:EC:10',
        ],
      },
    },
  ];

  return new NextResponse(JSON.stringify(assetLinks, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
