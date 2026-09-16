import { GuestPass } from "@/components/passes/guest-pass";

export const metadata = {
  title: "GTP 2026 guest pass",
};

export default async function GuestPassPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  return <GuestPass publicId={publicId} />;
}
