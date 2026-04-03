import "./globals.css";
import { AuthProvider } from '@/lib/auth-context';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: "Workvanta — Intelligent Job Matching Platform",
  description: "Find your perfect career match with AI-powered job recommendations. Workvanta connects talented candidates with top employers using intelligent matching algorithms.",
  keywords: "jobs, career, recruitment, AI matching, job search",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="page-wrapper">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
