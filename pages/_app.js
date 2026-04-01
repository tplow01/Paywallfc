// pages/_app.js
import { Kanit } from "next/font/google";
import "@fontsource-variable/mona-sans";
import "../styles/globals.css";
import Head from "next/head";

const kanit = Kanit({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-kanit",
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={kanit.variable} style={{ display: "contents" }}>
        <Component {...pageProps} />
      </div>
    </>
  );
}
