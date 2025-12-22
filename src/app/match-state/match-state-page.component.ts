import {
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { MatchService } from '../match.service';
import { MatchState, MapInfo } from '../models';
import { MatchSocketService } from '../match-socket.service';

const BAN_PHASE_ID = 0;
const PICK_PHASE_ID = 1;
const SIDE_PHASE_ID = 2;
const COMPLETED_PHASE_ID = 3;
const TEAM_A = 0;
const TEAM_B = 1;
const ATTACK_SIDE_ID = 0;
const DEFEND_SIDE_ID = 1;

type Role = 'captain' | 'spectator' | null;

interface CaptainAuthStored {
  role?: Role;
  team?: number;
  token?: string;
}

type StepKind = 'BAN' | 'PICK' | 'SIDE';

interface TimelineRow {
  index: number;            // 0-based
  stepNum: string;          // "01", "02", ...
  teamIndex: number;        // 0/1
  kind: StepKind;
  rightLabel: string;       // "BAN MAP" / "CHOOSE MAP" / "CHOOSE SIDE"
  isCurrent: boolean;
  isDone: boolean;

  mapName?: string;
  mapImgUrl?: string;

  sideLabel?: string;       // "ATTACK" / "DEFENSE" for SIDE
}

@Component({
  standalone: true,
  selector: 'app-match-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './match-state-page.component.html',
  styleUrls: ['./match-state-page.component.css'],
})
export class MatchStatePageComponent implements OnInit, OnDestroy {
  readonly BAN_PHASE_ID = BAN_PHASE_ID;
  readonly PICK_PHASE_ID = PICK_PHASE_ID;
  readonly SIDE_PHASE_ID = SIDE_PHASE_ID;
  readonly COMPLETED_PHASE_ID = COMPLETED_PHASE_ID;

  // Basic state 
  matchId = '';
  match?: MatchState;
  loading = false;
  errorMessage = '';

  // Identity / auth 
  myTeamIndex: number | null = null;
  role: Role = null;
  captainToken: string | null = null;

  // Logs
  matchLogs: string[] = [];

  // Internals
  private wsSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly matchService: MatchService,
    private readonly matchSocket: MatchSocketService,
    @Inject(PLATFORM_ID) private readonly platformId: Object
  ) { }

  // Lifecycle 

  ngOnInit(): void {
    this.subscribeToRouteParams();
    this.subscribeToMatchUpdates();
  }

  ngOnDestroy(): void {
    this.matchSocket.disconnect();
    this.wsSub?.unsubscribe();
  }

  // Public handlers 

  onMapHoverEnter(video: HTMLVideoElement | null): void {
    if (!video) return;
    try {
      video.muted = true;
      video.disablePictureInPicture = true;
      video.currentTime = 0;
      video.play();
    } catch (e) {
      console.warn('Could not play preview video', e);
    }
  }

  onMapHoverLeave(video: HTMLVideoElement | null): void {
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }

  onSideClick(sideId: number): void {
    if (!this.matchId || !this.match) return;

    if (!this.isCurrentUserCaptain()) {
      this.errorMessage = 'Only team captains can choose sides';
      return;
    }

    if (!this.isCurrentTeamTurn()) {
      this.errorMessage = `It is currently ${this.getCurrentTeamName()}'s turn`;
      return;
    }

    // Call API with action='side' and mapId=sideId (0=Attack, 1=Defend)
    this.loading = true;
    this.matchService
      .applyAction(
        this.matchId,
        this.myTeamIndex!,
        'side',
        sideId,
        this.captainToken!
      )
      .subscribe({
        next: (state) => {
          this.match = state;
          this.loading = false;
        },
        error: (err) => {
          console.error('Action error:', err);
          this.errorMessage = 'Action rejected by server';
          this.loading = false;
        },
      });
  }

  onMapClick(map: MapInfo): void {
    if (!this.matchId || !this.match) {
      this.errorMessage = 'Create or join a match first';
      return;
    }

    // If we are in Side Selection, clicking a map should do nothing
    if (this.getCurrentActionType() === 'side') {
      console.warn('Cannot pick a map during Side Selection phase.');
      return;
    }

    if (!this.isCurrentUserCaptain()) {
      this.errorMessage = 'Only team captains can make picks/bans';
      return;
    }

    if (!this.isCurrentTeamTurn()) {
      this.errorMessage = `It is currently ${this.getCurrentTeamName()}'s turn`;
      return;
    }

    const action = this.getCurrentActionType();
    if (!action) {
      this.errorMessage = 'Match is already completed';
      return;
    }

    this.errorMessage = '';
    this.loading = true;

    this.matchService
      .applyAction(
        this.matchId,
        this.myTeamIndex!,
        action,
        map.id,
        this.captainToken!
      )
      .subscribe({
        next: (state) => {
          this.match = state;
          this.loading = false;
        },
        error: (err) => {
          console.error('Action error:', err);
          this.errorMessage = 'Action rejected by server';
          this.loading = false;
        },
      });
  }

  // Match Log Helpers
  private actionToKind(action: number): StepKind {
    // backend: 0 Ban, 1 Pick, 2 Side
    if (action === 0) return 'BAN';
    if (action === 1) return 'PICK';
    return 'SIDE';
  }

  private rightLabelFor(kind: StepKind): string {
    if (kind === 'BAN') return 'BAN MAP';
    if (kind === 'PICK') return 'CHOOSE MAP';
    return 'CHOOSE SIDE';
  }

  private sideToLabel(v: number | undefined): string | undefined {
    if (v === 0) return 'ATTACK';
    if (v === 1) return 'DEFENSE';
    return undefined;
  }

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  private getMapById(mapId: number) {
    // if you have a full map list, use that; otherwise availableMaps is fine for names/imgs
    return this.match?.availableMaps?.find(m => m.id === mapId);
  }
  timelineRows: TimelineRow[] = [];

private rebuildTimelineRows(): void {
  const m = this.match;
  if (!m?.steps?.length) {
    this.timelineRows = [];
    return;
  }

  this.timelineRows = m.steps.map((s, i) => {
    const kind = this.actionToKind(s.action);
    const mapId = m.stepMapIds?.[i] ?? 0;
    const sideVal = m.stepSideVals?.[i];

    const map = mapId ? this.getMapById(mapId) : undefined;

    return {
      index: i,
      stepNum: this.pad2(i + 1),
      teamIndex: s.teamIndex,
      kind,
      rightLabel: this.rightLabelFor(kind),
      isCurrent: m.currentStepIndex === i,
      isDone: !!mapId,

      mapName: map?.name,
      mapImgUrl: map?.mapImgUrl,

      sideLabel: kind === 'SIDE' ? this.sideToLabel(sideVal) : undefined,
    };
  });
}


  // Helpers

  trackByMapId(index: number, map: MapInfo): number {
    return map.id;
  }

  getMyTeamName(): string {
    if (!this.match || this.myTeamIndex === null) return '';
    return this.match.teams[this.myTeamIndex]?.name || '';
  }

  getEnemyTeamName(): string {
    if (!this.match || this.myTeamIndex === null) return '';
    const enemyIdx = this.myTeamIndex === TEAM_A ? TEAM_B : TEAM_A;
    return this.match.teams[enemyIdx]?.name || '';
  }

  getTurnDisplay(): string {
    if (!this.match) return '';

    // If I am a spectator, show the actual team name (e.g. "Team A")
    if (this.role === 'spectator' || this.myTeamIndex === null) {
      return this.getCurrentTeamName();
    }

    // If I am a captain, show relative text
    return this.isMyTurn ? 'YOUR TEAM' : 'ENEMY TEAM';
  }

  getPhaseLabel(): string {
    if (!this.match) return '';
    const p = Number(this.match.phase);
    switch (p) {
      case BAN_PHASE_ID:
        return 'Ban Phase';
      case PICK_PHASE_ID:
        return 'Pick Phase';
      case SIDE_PHASE_ID:
        return 'Side Selection';
      case COMPLETED_PHASE_ID:
        return 'Completed';
      default:
        return `Phase ${p}`;
    }
  }

  getCurrentTeamName(): string {
    if (!this.match) return '';
    const idx = this.match.currentTurnTeam;
    return this.match.teams[idx]?.name ?? `Team ${idx}`;
  }

  getMapNameById(mapId: number): string {
    if (!this.match || !mapId) return '';
    const map = this.match.availableMaps.find((m) => m.id === mapId);
    return map ? map.name : `Map ${mapId}`;
  }

  isMapBanned(map: MapInfo): boolean {
    if (!this.match) return false;
    return this.match.teams.some((team) =>
      team.bannedMapIds.includes(map.id)
    );
  }

  isMapPicked(map: MapInfo): boolean {
    if (!this.match) return false;
    return this.match.teams.some((team) => team.pickedMapIds.includes(map.id));
  }

  isDecider(map: MapInfo): boolean {
    if (!this.match) return false;
    return (
      Number(this.match.phase) === COMPLETED_PHASE_ID &&
      this.match.deciderMapId === map.id
    );
  }

  isBo1(): boolean {
    return !!this.match && this.match.seriesType === 'bo1';
  }

  isBo3(): boolean {
    return !!this.match && this.match.seriesType === 'bo3';
  }

  getDeciderMapName(): string {
    if (!this.match || !this.match.deciderMapId) return '';
    return this.getMapNameById(this.match.deciderMapId);
  }

  getDeciderMapUrl(): string {
    if (!this.match || !this.match.deciderMapId) return '';
    // Find the map object to get its preview image
    const map = this.match.availableMaps.find(m => m.id === this.match!.deciderMapId);
    // Fallback to a default if not found
    return map && map.mapImgUrl ? map.mapImgUrl : "";
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  getAttackingTeamName(): string {
    if (!this.match) return 'TBD';
    const picker = this.match.deciderSidePickerTeam;
    if (picker !== TEAM_A && picker !== TEAM_B) return 'TBD';

    const other = picker === TEAM_A ? TEAM_B : TEAM_A;

    return this.match.deciderSide === ATTACK_SIDE_ID
      ? this.match.teams[picker].name
      : this.match.teams[other].name;
  }

  getDefendingTeamName(): string {
    if (!this.match) return 'TBD';
    const picker = this.match.deciderSidePickerTeam;
    if (picker !== TEAM_A && picker !== TEAM_B) return 'TBD';

    const other = picker === TEAM_A ? TEAM_B : TEAM_A;

    return this.match.deciderSide === DEFEND_SIDE_ID
      ? this.match.teams[picker].name
      : this.match.teams[other].name;
  }


  // Private helpers

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private subscribeToRouteParams(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;

      this.matchId = id;
      const teamParam = params.get('teamIndex');
      this.initializeIdentityFromRoute(id, teamParam);
      this.initMatchWithWebSocket(id);
    });
  }

  private subscribeToMatchUpdates(): void {
    this.wsSub = this.matchSocket.matchState$.subscribe((state) => {
      if (state) {
        
        this.match = state;
        this.rebuildTimelineRows();
      }
    });
  }

  private initializeIdentityFromRoute(
    matchId: string,
    teamParam: string | null
  ): void {
    if (teamParam === null) {
      this.setSpectator(matchId);
      return;
    }

    const teamIndex = Number(teamParam);
    this.myTeamIndex = isNaN(teamIndex) ? null : teamIndex;

    if (!this.isBrowser) {
      // SSR fallback
      this.role = null;
      this.captainToken = null;
      return;
    }

    const storedRaw = localStorage.getItem(
      `match_${matchId}_team_${teamParam}_auth`
    );

    if (!storedRaw) {
      this.setSpectator(matchId);
      return;
    }

    try {
      const parsed: CaptainAuthStored = JSON.parse(storedRaw);
      this.role = parsed.role ?? 'captain';
      this.myTeamIndex = typeof parsed.team === 'number' ? parsed.team : teamIndex;
      this.captainToken = parsed.token ?? null;
    } catch {
      // If parsing fails, assume captain but without token
      this.role = 'captain';
      this.captainToken = null;
    }
  }

  private setSpectator(matchId: string): void {
    this.role = 'spectator';
    this.myTeamIndex = null;
    this.captainToken = null;
    this.router.navigate(['/match', matchId], { replaceUrl: true })
  }

  private initMatchWithWebSocket(id: string): void {
    this.matchService.getState(id).subscribe({
      next: (state) => {
        this.match = state;
        this.rebuildTimelineRows();
        this.matchSocket.connect(id);
      },
      error: (err) => {
        console.error('Initial load error', err);
        this.errorMessage = 'Failed to load match. Redirecting...';
        this.router.navigate(['/']);
      },
    });
  }

  private isCurrentUserCaptain(): boolean {
    return this.role === 'captain' && this.myTeamIndex !== null && !!this.captainToken;
  }

  private isCurrentTeamTurn(): boolean {
    if (!this.match) return false;
    return this.match.currentTurnTeam === this.myTeamIndex;
  }

  private getCurrentActionType(): 'ban' | 'pick' | 'side' | null {
    if (!this.match) return null;
    if (this.match.phase === BAN_PHASE_ID) return 'ban';
    if (this.match.phase === PICK_PHASE_ID) return 'pick';
    if (this.match.phase === SIDE_PHASE_ID) return 'side';
    return null;
  }

  // Gets data for the 3 columns in BO3
  getBo3MapCardsData() {
    if (!this.match) return [];
    const cards = [];

    // Helper to extract image safely
    const getImg = (m: MapInfo) => m.mapImgUrl || m.previewUrl || '';

    // Team A Pick
    if (this.match.teams[0].pickedMapIds.length > 0) {
      const map = this.match.availableMaps.find(m => m.id === this.match!.teams[0].pickedMapIds[0]);
      if (map) {
        cards.push({
          mapName: map.name,
          imageUrl: getImg(map),
          selectedBy: this.match.teams[0].name,
          accentClass: 'accent-cyan'
        });
      }
    }

    // Team B Pick
    if (this.match.teams[1].pickedMapIds.length > 0) {
      const map = this.match.availableMaps.find(m => m.id === this.match!.teams[1].pickedMapIds[0]);
      if (map) {
        cards.push({
          mapName: map.name,
          imageUrl: getImg(map),
          selectedBy: this.match.teams[1].name,
          accentClass: 'accent-red'
        });
      }
    }

    // Decider
    if (this.match.deciderMapId) {
      const map = this.match.availableMaps.find(m => m.id === this.match!.deciderMapId);
      if (map) {
        cards.push({
          mapName: map.name,
          imageUrl: getImg(map),
          selectedBy: 'Decider',
          accentClass: 'accent-white'
        });
      }
    }
    return cards;
  }

  get isMyTurn(): boolean {
    if (!this.match || this.role !== 'captain') {
      return false;
    }
    return this.myTeamIndex === this.match.currentTurnTeam;
  }

  get isBanPhase(): boolean {
    return this.match?.phase === BAN_PHASE_ID;
  }

  get isSidePhase(): boolean {
    return this.match?.phase === SIDE_PHASE_ID;
  }

  get actionColorClass(): string {
    return this.isBanPhase ? 'val-red-text' : 'val-cyan-text';
  }
}