import { motion } from 'motion/react';

import { Bot, Zap, Shield, BarChart3, Clock, Users } from "lucide-react";

import { Card } from "@/components/ui/card";



const features = [

  {

    icon: Bot,

    title: "Intelligent Automation",

    description: "AI-powered bots handle repetitive tasks automatically, learning and adapting to your workflows.",

    color: "text-primary"

  },

  {

    icon: Zap,

    title: "Lightning Fast",

    description: "Process admin tasks in seconds, not hours. Experience unprecedented speed and efficiency.",

    color: "text-secondary"

  },

  {

    icon: Shield,

    title: "Enterprise Security",

    description: "Bank-level encryption and compliance standards to keep your data safe and secure.",

    color: "text-primary"

  },

  {

    icon: BarChart3,

    title: "Smart Analytics",

    description: "Get real-time insights and analytics to make data-driven decisions for your business.",

    color: "text-secondary"

  },

  {

    icon: Clock,

    title: "24/7 Availability",

    description: "Your AI assistant never sleeps. Automate workflows around the clock without interruption.",

    color: "text-primary"

  },

  {

    icon: Users,

    title: "Team Collaboration",

    description: "Seamlessly collaborate with your team and streamline communication across departments.",

    color: "text-secondary"

  }

];



export function Features() {

  return (

    <section id="features" className="py-20 px-6 bg-muted/30">

      <div className="container mx-auto">

        <motion.div

          initial={{ opacity: 0, y: 20 }}

          whileInView={{ opacity: 1, y: 0 }}

          viewport={{ once: true }}

          transition={{ duration: 0.6 }}

          className="text-center mb-16"

        >

          <h2 className="text-4xl font-semibold text-foreground mb-4">

            Everything You Need to Automate Admin

          </h2>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">

            Powerful features designed to streamline your workflow and boost productivity

          </p>

        </motion.div>



        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

          {features.map((feature, index) => {

            const Icon = feature.icon;

            return (

              <motion.div

                key={index}

                initial={{ opacity: 0, y: 20 }}

                whileInView={{ opacity: 1, y: 0 }}

                viewport={{ once: true }}

                transition={{ duration: 0.6, delay: index * 0.1 }}

              >

                <Card className="p-6 h-full hover:shadow-lg transition-shadow border-border bg-card">

                  <div className={`w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4`}>

                    <Icon className={`w-6 h-6 ${feature.color}`} />

                  </div>

                  <h3 className="font-semibold text-foreground mb-2">

                    {feature.title}

                  </h3>

                  <p className="text-muted-foreground">

                    {feature.description}

                  </p>

                </Card>

              </motion.div>

            );

          })}

        </div>

      </div>

    </section>

  );

}

