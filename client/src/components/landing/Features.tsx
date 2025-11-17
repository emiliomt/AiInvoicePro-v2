import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Shield, TrendingUp, Bot, Clock, Globe } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast Processing",
    description: "Process thousands of documents in seconds with our optimized AI pipeline."
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-level encryption and compliance with industry standards."
  },
  {
    icon: TrendingUp,
    title: "Smart Analytics",
    description: "Real-time insights and analytics to optimize your workflows."
  },
  {
    icon: Bot,
    title: "AI-Powered Automation",
    description: "Machine learning models that continuously improve accuracy."
  },
  {
    icon: Clock,
    title: "24/7 Availability",
    description: "Always-on infrastructure ensures zero downtime operations."
  },
  {
    icon: Globe,
    title: "Global Scale",
    description: "Built to handle operations across multiple regions seamlessly."
  }
];

export function Features() {
  return (
    <section id="features" className="py-20 px-6 bg-muted/50">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl lg:text-5xl font-semibold text-foreground mb-4">
            Powerful Features
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to automate and streamline your admin processes
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

