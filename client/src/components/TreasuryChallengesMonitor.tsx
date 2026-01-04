import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react';
import { getChallengeImbalance, fulfillTreasuryMatches } from '@/lib/adminApi';
import { useAdminQuery } from '@/lib/adminApi';

interface Challenge {
  id: number;
  title: string;
  status: string;
  yesPool: string;
  noPool: string;
  entryFee: string;
  endDate: string;
  result?: boolean;
  createdAt: string;
}

interface ImbalanceData {
  yesStakes: number;
  noStakes: number;
  yesCount: number;
  noCount: number;
  gap: number;
  imbalancedSide: 'YES' | 'NO' | null;
  matchRate: number;
  treasuryConfig?: {
    maxTreasuryRisk: number;
    totalTreasuryAllocated: number;
    filledSide?: string;
    filledCount: number;
  };
}

interface TreasuryChallengesMonitorProps {
  adminId: string;
}

export const TreasuryChallengesMonitor: React.FC<TreasuryChallengesMonitorProps> = ({
  adminId,
}) => {
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isFilling, setIsFilling] = useState(false);

  // Fetch admin-created challenges
  const { data: challenges = [], isLoading: challengesLoading } = useAdminQuery("/api/admin/challenges", {
    retry: false,
  });

  // Filter to active challenges only
  const activeChallenges = challenges.filter((c: Challenge) =>
    c.status === 'active' && !c.result
  );

  const handleFillTreasury = async (challenge: Challenge, side: 'YES' | 'NO', matchCount: number) => {
    if (!challenge) return;

    setIsFilling(true);
    try {
      await fulfillTreasuryMatches(challenge.id, matchCount, side);
      // Refetch will happen automatically due to query invalidation
    } catch (error) {
      console.error('Error filling treasury matches:', error);
    } finally {
      setIsFilling(false);
    }
  };

  if (challengesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            Active Challenges Imbalance Monitor
          </CardTitle>
          <CardDescription>
            Monitor imbalances in admin-created challenges and fill with treasury matches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeChallenges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active challenges found
            </div>
          ) : (
            <div className="space-y-4">
              {activeChallenges.map((challenge: Challenge) => (
                <ChallengeImbalanceCard
                  key={challenge.id}
                  challenge={challenge}
                  onFillTreasury={handleFillTreasury}
                  isFilling={isFilling}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface ChallengeImbalanceCardProps {
  challenge: Challenge;
  onFillTreasury: (challenge: Challenge, side: 'YES' | 'NO', matchCount: number) => void;
  isFilling: boolean;
}

const ChallengeImbalanceCard: React.FC<ChallengeImbalanceCardProps> = ({
  challenge,
  onFillTreasury,
  isFilling,
}) => {
  const { data: imbalance, isLoading } = useQuery({
    queryKey: [`challenge-imbalance-${challenge.id}`],
    queryFn: () => getChallengeImbalance(challenge.id),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (isLoading || !imbalance) {
    return (
      <Card className="border-l-4 border-l-gray-400">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h4 className="font-medium">{challenge.title}</h4>
              <p className="text-sm text-muted-foreground">Loading imbalance data...</p>
            </div>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { yesStakes, noStakes, yesCount, noCount, gap, imbalancedSide, matchRate, treasuryConfig } = imbalance;
  const hasImbalance = gap > 0;
  const totalStakes = yesStakes + noStakes;
  const yesPercentage = totalStakes > 0 ? (yesStakes / totalStakes) * 100 : 50;
  const noPercentage = totalStakes > 0 ? (noStakes / totalStakes) * 100 : 50;

  const getBorderColor = () => {
    if (!hasImbalance) return 'border-l-green-500';
    return imbalancedSide === 'YES' ? 'border-l-blue-500' : 'border-l-red-500';
  };

  const getStatusBadge = () => {
    if (!hasImbalance) return <Badge variant="secondary">Balanced</Badge>;
    return (
      <Badge variant="destructive">
        {gap} {imbalancedSide} imbalance
      </Badge>
    );
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h4 className="font-medium">{challenge.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge()}
              <span className="text-sm text-muted-foreground">
                {yesCount + noCount} participants
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            Entry: ₦{parseFloat(challenge.entryFee).toLocaleString()}
          </div>
        </div>

        {/* Stakes Distribution */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-1 text-blue-500" />
              YES: ₦{yesStakes.toLocaleString()} ({yesCount} users)
            </span>
            <span className="flex items-center">
              <TrendingDown className="h-4 w-4 mr-1 text-red-500" />
              NO: ₦{noStakes.toLocaleString()} ({noCount} users)
            </span>
          </div>
          <Progress value={yesPercentage} className="h-2" />
        </div>

        {/* Treasury Config */}
        {treasuryConfig && (
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <div className="flex justify-between items-center text-sm">
              <span>Treasury Config:</span>
              <span>Max Risk: ₦{treasuryConfig.maxTreasuryRisk.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span>Allocated:</span>
              <span>₦{treasuryConfig.totalTreasuryAllocated.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span>Remaining:</span>
              <span>₦{(treasuryConfig.maxTreasuryRisk - treasuryConfig.totalTreasuryAllocated).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Fill Treasury Button */}
        {hasImbalance && treasuryConfig && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFillTreasury(challenge, imbalancedSide!, gap)}
              disabled={isFilling || treasuryConfig.totalTreasuryAllocated + (gap * parseFloat(challenge.entryFee)) > treasuryConfig.maxTreasuryRisk}
              className="flex-1"
            >
              {isFilling ? 'Filling...' : `Fill ${gap} ${imbalancedSide} matches`}
            </Button>
          </div>
        )}

        {!treasuryConfig && hasImbalance && (
          <div className="text-sm text-muted-foreground bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
            Configure treasury settings to enable automatic balancing
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TreasuryChallengesMonitor;