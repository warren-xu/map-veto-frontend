export interface MapInfo {
  id: number;
  name: string;
  previewUrl?: string;
  mapImgUrl?: string;
}

export interface TeamSlot {
  playerName: string;
  mapId: number; // 0 = unassigned
}

export interface Team {
  name: string;
  bannedMapIds: number[];
  pickedMapIds: number[];
}

export interface StepTemplate {
  action: number;     // 0 Ban, 1 Pick, 2 Side  (matches backend enum order)
  teamIndex: number;  // 0 or 1
}

export interface MatchState {
  id: string;
  phase: number;            // 0=BanPhase,1=PickPhase,2=SidePhase,3=Completed
  currentTurnTeam: number;  
  currentStepIndex: number;
  captainTaken: boolean[];
  deciderMapId: number;
  seriesType: 'bo1' | 'bo3';
  teams: Team[];
  availableMaps: MapInfo[];
  deciderSide?: number; 
  deciderSidePickerTeam: number; 
  steps: StepTemplate[];
  stepMapIds: number[];     // length === steps.length
  stepSideVals: number[];   // length === steps.length, -1 unset, 0 atk, 1 def
}
