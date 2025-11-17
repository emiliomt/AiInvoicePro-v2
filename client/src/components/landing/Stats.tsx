import { motion } from 'framer-motion';

import { TrendingUp, Users, Clock, DollarSign } from "lucide-react";



const stats = [

  {

    icon: TrendingUp,

    value: "300%",

    label: "Productivity Increase",

    description: "Average boost in team efficiency"

  },

  {

    icon: Users,

    value: "10,000+",

    label: "Happy Customers",

    description: "Businesses automating with us"

  },

  {

    icon: Clock,

    value: "100M+",

    label: "Hours Saved",

    description: "Total time saved across all users"

  },

  {

    icon: DollarSign,

    value: "$50M+",

    label: "Cost Savings",

    description: "Operational costs reduced"

  }

];



export function Stats() {

  return (

    <section className="py-20 px-6 bg-gradient-to-br from-primary/5 via-background to-secondary/5">

      <div className="container mx-auto">

        <motion.div

          initial={{ opacity: 0, y: 20 }}

          whileInView={{ opacity: 1, y: 0 }}

          viewport={{ once: true }}

          transition={{ duration: 0.6 }}

          className="text-center mb-16"

        >

          <h2 className="text-4xl font-semibold text-foreground mb-4">

            Trusted by Leading Organizations

          </h2>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">

            Join thousands of businesses that are transforming their operations with AI

          </p>

        </motion.div>



        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">

          {stats.map((stat, index) => {

            const Icon = stat.icon;

            return (

              <motion.div

                key={index}

                initial={{ opacity: 0, scale: 0.9 }}

                whileInView={{ opacity: 1, scale: 1 }}

                viewport={{ once: true }}

                transition={{ duration: 0.6, delay: index * 0.1 }}

                className="text-center"

              >

                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary mb-4">

                  <Icon className="w-8 h-8 text-white" />

                </div>

                <div className="text-4xl font-semibold text-foreground mb-2">

                  {stat.value}

                </div>

                <div className="font-medium text-foreground mb-1">

                  {stat.label}

                </div>

                <div className="text-sm text-muted-foreground">

                  {stat.description}

                </div>

              </motion.div>

            );

          })}

        </div>

      </div>

    </section>

  );

}

