import { useBusiness } from "@/contexts/BusinessContext";
import { useGetDashboardStats, useGetRecentActivity, getGetDashboardStatsQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, Reply, TrendingUp, Activity, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function DashboardPage() {
  const { selectedBusinessId } = useBusiness();

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: {
      enabled: !!selectedBusinessId,
      queryKey: getGetDashboardStatsQueryKey({ businessId: selectedBusinessId ?? undefined })
    }
  }, { businessId: selectedBusinessId ?? undefined });

  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({
    query: {
      enabled: !!selectedBusinessId,
      queryKey: getGetRecentActivityQueryKey({ businessId: selectedBusinessId ?? undefined, limit: 10 })
    }
  }, { businessId: selectedBusinessId ?? undefined, limit: 10 });

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-12 h-12 border border-border mx-auto flex items-center justify-center">
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">No Business Selected</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Please select or create a business workspace to view dashboard statistics and activities.
          </p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Leads",
      value: stats?.totalLeads ?? "-",
      icon: Users,
      description: "All collected leads"
    },
    {
      title: "Sent Emails",
      value: stats?.totalEmailsSent ?? "-",
      icon: Send,
      description: "Total emails dispatched"
    },
    {
      title: "Replied",
      value: stats?.repliedLeads ?? "-",
      icon: Reply,
      description: "Positive or negative replies"
    },
    {
      title: "Reply Rate",
      value: stats?.replyRate ? `${stats.replyRate.toFixed(1)}%` : "-",
      icon: TrendingUp,
      description: "Conversion percentage"
    }
  ];

  return (
    <div className="flex-1 overflow-auto p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest">System Overview / Performance Metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Card className="rounded-none border-border shadow-none hover:bg-muted/10 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium tracking-tight">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-mono">
                    {statsLoading ? "..." : stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="lg:col-span-2 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-lg font-bold tracking-tight">Recent Activity</h2>
              <div className="text-xs font-mono text-muted-foreground uppercase">Live Feed</div>
            </div>
            
            <div className="space-y-0 border border-border">
              {activityLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground font-mono">LOADING_DATA...</div>
              ) : activity?.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No recent activity found.</div>
              ) : (
                activity?.map((item, i) => (
                  <div 
                    key={item.id} 
                    className={`flex items-start gap-4 p-4 ${i !== activity.length - 1 ? 'border-b border-border' : ''} hover:bg-muted/20 transition-colors`}
                  >
                    <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center shrink-0 mt-0.5 bg-background">
                      {item.type === 'email_sent' ? <Send className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.type === 'email_sent' ? `Email sent to ${item.companyName || 'Unknown'}` : `Lead ${item.companyName} added`}
                      </p>
                      {item.subject && (
                        <p className="text-xs text-muted-foreground truncate mt-1">"{item.subject}"</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 border border-border uppercase tracking-wider text-muted-foreground">
                          {item.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-lg font-bold tracking-tight">System Status</h2>
            </div>
            
            <Card className="rounded-none border-border shadow-none bg-primary text-primary-foreground">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-mono uppercase tracking-widest">Status</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-mono">OPERATIONAL</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-primary-foreground/70 mb-1">Queue Pipeline</div>
                    <div className="flex justify-between items-end border-b border-primary-foreground/20 pb-1">
                      <span className="text-2xl font-bold font-mono">{stats?.unsentLeads ?? 0}</span>
                      <span className="text-xs font-mono pb-1">Pending</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs text-primary-foreground/70 mb-1">Active Campaigns</div>
                    <div className="flex justify-between items-end border-b border-primary-foreground/20 pb-1">
                      <span className="text-2xl font-bold font-mono">{stats?.totalCampaigns ?? 0}</span>
                      <span className="text-xs font-mono pb-1">Running</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
