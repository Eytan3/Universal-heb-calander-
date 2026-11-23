import type { Metadata } from "next";
import LoginForm from "@/ui/LoginForm";

export const metadata: Metadata = { title: "עִתִּים · Ittim — כניסה", robots: { index: false } };

export default function LoginPage() {
  return <LoginForm />;
}
