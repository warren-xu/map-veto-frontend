export interface MapInfo {
  id: number;
  name: string;
}

export interface TeamSlot {
  playerName: string;
  mapId: number; // 0 = unassigned
}

export interface Team {
  name: string;
  slots: TeamSlot[];
  bannedMapIds: number[];
}

export interface MatchState {
  id: string;
  phase: number;            // 0=BanPhase,1=PickPhase,2=Completed
  currentTurnTeam: number;  
  currentStepIndex: number;
  deciderMapId: number;
  seriesType: 'bo1' | 'bo3';
  teams: Team[];
  availableMaps: MapInfo[];
}
