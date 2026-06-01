import { useState, useEffect } from "react";
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  CheckCircle2,
  Users,
  FileText,
  Upload,
  Tags,
  Shield,
  Menu,
  X,
  ArrowRight,
  Sparkles,
  Zap,
  TrendingUp,
  Database,
  Lock,
  Vote,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { cn } from "@shared/lib/cn";

export function LandingPage() {
  const [email, setEmail] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroY = useTransform(scrollY, [0, 400], [0, 150]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.95]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Waitlist signup:", email);
    setShowToast(true);
    setEmail("");
    setTimeout(() => setShowToast(false), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Animated Subtle Background Grid */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, #3553eb 1.5px, transparent 0)",
          backgroundSize: "32px 32px"
        }}
      />

      {/* Navbar */}
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          isScrolled
            ? "bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm py-3"
            : "bg-transparent py-6",
        )}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex justify-between items-center">
          <motion.div
            className="flex items-center gap-3"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <div className="relative w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-md">
              <Vote className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              PoliCRM
            </span>
          </motion.div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-semibold text-slate-650 hover:text-primary transition-colors"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-sm font-semibold text-slate-650 hover:text-primary transition-colors"
            >
              About
            </a>
            <Link
              to="/war-room"
              className="text-sm font-semibold text-slate-650 hover:text-primary transition-colors"
            >
              War Room
            </Link>
            <Button variant="ghost" className="font-semibold text-slate-700 hover:text-primary" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button className="bg-primary hover:bg-primary/95 text-white shadow-sm font-semibold text-sm" asChild>
              <a href="#join">Get Started</a>
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-slate-650 hover:text-primary transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-[60px] z-40 bg-white border-b border-slate-200 pt-6 pb-8 px-6 md:hidden shadow-lg"
          >
            <div className="flex flex-col gap-5 text-base font-semibold">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-primary transition-colors"
              >
                Features
              </a>
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-primary transition-colors"
              >
                About
              </a>
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-primary transition-colors"
              >
                Sign In
              </Link>
              <Button className="w-full bg-primary text-white" asChild>
                <a href="#join">Get Started</a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full">
          <motion.div
            style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-250 text-slate-700 rounded-full text-xs font-semibold mb-8 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Closed Beta Available</span>
            </motion.div>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight text-slate-900"
            >
              The Modern CRM for
              <br />
              <span className="text-primary">Australian Politics</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed font-medium"
            >
              Streamline member management, automate AEC validation, and power your campaign with the only CRM purpose-built for Australian political organizing.
            </motion.p>

            {/* CTA Form */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="max-w-md mx-auto mb-16"
              id="join"
            >
              <form onSubmit={handleSubmit} className="relative">
                <div className="flex flex-col sm:flex-row gap-2.5 p-2 bg-white border border-slate-250 rounded-xl shadow-md">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="border-0 bg-transparent focus-visible:ring-0 text-sm h-11 placeholder:text-slate-400 flex-1"
                  />
                  <Button
                    size="lg"
                    type="submit"
                    className="h-11 px-6 rounded-lg bg-primary hover:bg-primary/95 text-white transition-all font-bold text-sm shadow-sm"
                  >
                    Join Waitlist
                    <ArrowRight className="ml-1.5 w-4 h-4" />
                  </Button>
                </div>
              </form>
              <p className="mt-3.5 text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                <Shield className="w-3.5 h-3.5" /> Secure, private, and fully compliant with privacy laws.
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap justify-center gap-10 md:gap-16 text-center border-t border-slate-200 pt-10 mb-16"
            >
              <div>
                <div className="text-3xl font-extrabold text-slate-900 mb-0.5">
                  <CountUpNumber end={10000} suffix="+" />
                </div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Members Verified
                </div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-slate-900 mb-0.5">
                  <CountUpNumber end={99} suffix="%" />
                </div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Accuracy Rate
                </div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-slate-900 mb-0.5">
                  <CountUpNumber end={2} suffix=" hrs" />
                </div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Avg. Time Saved
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Case Study Section */}
      <CaseStudySection />

      {/* Features Grid - Bento Style */}
      <section id="features" className="py-24 relative bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-slate-700 text-xs font-semibold mb-4">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>Features Blueprint</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
              Everything required to win
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto font-medium">
              Purpose-built tools designed specifically for the unique regulatory environments of Australian politics.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <FeatureCard key={idx} feature={feature} index={idx} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-28 relative bg-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)",
            backgroundSize: "24px 24px"
          }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight">
              Ready to transform your party?
            </h2>
            <p className="text-lg text-slate-350 mb-10 max-w-xl mx-auto leading-relaxed">
              Join our closed beta today and experience the future of political operations.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="h-12 px-8 text-sm bg-primary hover:bg-primary/90 text-white font-bold rounded-lg shadow-md"
                asChild
              >
                <a href="#join">Get Early Access</a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8 text-sm border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white rounded-lg font-semibold"
                asChild
              >
                <Link to="/login">Console Login</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-md">
                  <Vote className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white tracking-tight">PoliCRM</span>
              </div>
              <p className="max-w-xs leading-relaxed text-sm text-slate-500 font-medium">
                The standard for modern political operations and AEC voter validation.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Console</h4>
              <ul className="space-y-2 text-sm font-medium">
                <li>
                  <Link to="/login" className="hover:text-white transition-colors">
                    Dashboard Login
                  </Link>
                </li>
                <li>
                  <Link to="/war-room" className="hover:text-white transition-colors">
                    War Room Map
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Info</h4>
              <ul className="space-y-2 text-sm font-medium text-slate-500">
                <li>© 2026 PoliCRM.</li>
                <li>All rights reserved.</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-500/20">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Added to list!</h4>
                <p className="text-xs text-slate-400 font-medium">
                  We'll contact you soon.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CountUpNumber({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 2000;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = (currentTime - startTime) / duration;

      if (progress < 1) {
        setCount(Math.floor(end * progress));
        requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    requestAnimationFrame(animate);
  }, [end]);

  return (
    <>
      {count}
      {suffix}
    </>
  );
}

function FeatureCard({ feature, index }: { feature: any; index: number }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={cn(
        "relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-300",
        feature.size || "md:col-span-1",
      )}
    >
      <div className="relative mb-5 w-fit">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm",
            feature.colorClass,
          )}
        >
          {feature.icon}
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-2">
        {feature.title}
      </h3>
      <p className="text-sm text-slate-500 leading-relaxed font-medium">{feature.description}</p>

      {/* Link arrow indicator */}
      <motion.div
        className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"
        animate={{ x: isHovered ? 4 : 0, opacity: isHovered ? 1 : 0 }}
      >
        <ArrowRight className="w-4 h-4 text-primary" />
      </motion.div>
    </motion.div>
  );
}

const features = [
  {
    icon: <CheckCircle2 className="w-6 h-6" />,
    title: "Automated AEC Verification",
    description:
      "Verify member enrollments automatically with our direct AEC integration. Ensure compliance without the manual headache.",
    colorClass: "bg-primary",
    size: "lg:col-span-2",
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Member Management",
    description:
      "Track members, tags, notes, and engagement history all in one beautiful, intuitive dashboard.",
    colorClass: "bg-slate-800",
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "Electoral Reporting",
    description:
      "Generate VEC/AEC compliant reports with one click. Export ready-to-submit formats.",
    colorClass: "bg-emerald-600",
  },
  {
    icon: <Upload className="w-6 h-6" />,
    title: "Smart CSV Import",
    description:
      "Migrate from NationBuilder or any platform effortlessly with intelligent duplicate detection.",
    colorClass: "bg-orange-500",
    size: "lg:col-span-2",
  },
  {
    icon: <Tags className="w-6 h-6" />,
    title: "Flexible Tagging",
    description:
      "Organize members with unlimited tags for targeted campaigns and communications.",
    colorClass: "bg-cyan-600",
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Secure & Compliant",
    description:
      "Bank-grade encryption, role-based access control, and full Privacy Act compliance.",
    colorClass: "bg-indigo-650",
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: "Analytics Dashboard",
    description:
      "Real-time insights into member growth, verification rates, and engagement metrics.",
    colorClass: "bg-rose-500",
  },
  {
    icon: <Database className="w-6 h-6" />,
    title: "Data Export",
    description:
      "Export your data anytime in multiple formats. Your data, always accessible.",
    colorClass: "bg-purple-650",
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: "Role-Based Access",
    description:
      "Fine-grained permissions ensure team members only see what they need to see.",
    colorClass: "bg-slate-700",
  },
];

function CaseStudySection() {
  return (
    <section className="py-20 relative bg-slate-900 border-t border-slate-850">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="bg-slate-800/40 border border-slate-800 rounded-3xl overflow-hidden relative p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-12 relative z-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-750 rounded-full text-slate-350 text-xs font-semibold mb-6">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Case Study: Fusion Party</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6 tracking-tight">
                From Crisis to Production in 48 Hours
              </h2>
              <p className="text-slate-300 text-lg mb-8 leading-relaxed font-medium">
                Facing a critical VEC deadline and funding at risk, Fusion Party used PoliCRM to validate voter rolls in record time.
              </p>

              <div className="space-y-4">
                {[
                  "Met VEC registration deadline with 911 verifications",
                  "Secured potential funding eligibility",
                  "Replaced NationBuilder for cost savings",
                  "Built custom compliance workflows",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-slate-200 text-sm font-semibold">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-slate-900/60 border border-slate-750 rounded-2xl p-6 shadow-xl">
                <div className="space-y-6">
                  <div className="flex justify-between items-center pb-6 border-b border-slate-750">
                    <div>
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        Verification Status
                      </div>
                      <div className="text-2xl font-extrabold text-white mt-1">
                        99.8% Complete
                      </div>
                    </div>
                    <div className="h-10 w-10 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400 font-semibold">
                      <span>Processed Members</span>
                      <span>911 / 911</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full w-full" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                      <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                        Time Saved
                      </div>
                      <div className="text-xl font-bold text-white">
                        40+ Hrs
                      </div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                      <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                        Status
                      </div>
                      <div className="text-xl font-bold text-white">Eligible</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
