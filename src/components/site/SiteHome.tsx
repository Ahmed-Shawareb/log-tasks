"use client";
// The LOG brand website (ported from Base44), now the home page of the system.
import { useState } from "react";
import LoadingScreen from "./LoadingScreen";
import Navbar, { type SignedIn } from "./Navbar";
import HeroSection from "./HeroSection";
import AboutSection from "./AboutSection";
import ServicesSection from "./ServicesSection";
import ShowreelSection from "./ShowreelSection";
import StatsSection from "./StatsSection";
import TestimonialsSection from "./TestimonialsSection";
import ContactSection from "./ContactSection";
import Footer from "./Footer";
import MarqueeBand from "./MarqueeBand";
import FloatingActions from "./FloatingActions";
import CustomCursor from "./CustomCursor";

export function SiteHome({ signedIn }: { signedIn: SignedIn }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="site min-h-dvh overflow-x-hidden">
      {!loaded && <LoadingScreen onComplete={() => setLoaded(true)} />}
      <div className={`${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-700 md:cursor-none`}>
        <div className="grain-overlay" />
        <CustomCursor />
        <FloatingActions />
        <Navbar signedIn={signedIn} />
        <HeroSection />
        <MarqueeBand />
        <AboutSection />
        <ServicesSection />
        <MarqueeBand reverse />
        <ShowreelSection />
        <StatsSection />
        <TestimonialsSection />
        <MarqueeBand />
        <ContactSection />
        <Footer />
      </div>
    </div>
  );
}
