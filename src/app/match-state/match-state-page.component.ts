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

type Role = 'captain' | 'spectator' | null;

interface CaptainAuthStored {
  role?: Role;
  team?: number;
  token?: string;
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

  // Internals
  private wsSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly matchService: MatchService,
    private readonly matchSocket: MatchSocketService,
    @Inject(PLATFORM_ID) private readonly platformId: Object
  ) {}

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

  // Helpers

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

  getTeamPickedMapNames(teamIndex: number): string[] {
    if (!this.match) return [];
    const team = this.match.teams[teamIndex];
    if (!team) return [];
    return team.pickedMapIds
      .map((id) => this.getMapNameById(id))
      .filter(Boolean);
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
    return map && map.mapImgUrl ? map.mapImgUrl : "" ;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  getAttackingTeamName(): string {
    if (!this.match) return 'TBD';

    const sidePickerIndex = 1; // Team B
    const otherTeamIndex = 0;  // Team A

    if (this.match.deciderSide === 0) {
      // Picker chose Attack
      return this.match.teams[sidePickerIndex].name;
    } else {
      // Picker chose Defense, so the other team Attacks
      return this.match.teams[otherTeamIndex].name;
    }
  }

  getDefendingTeamName(): string {
    if (!this.match) return 'TBD';

    const sidePickerIndex = 1;
    const otherTeamIndex = 0;

    if (this.match.deciderSide === 1) {
      // Picker chose Defense
      return this.match.teams[sidePickerIndex].name;
    } else {
      // Picker chose Attack, so the other team Defends
      return this.match.teams[otherTeamIndex].name;
    }
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
      this.myTeamIndex =
        typeof parsed.team === 'number' ? parsed.team : teamIndex;
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

  // --- NEW GETTER ---
  get isSidePhase(): boolean {
    return this.match?.phase === SIDE_PHASE_ID;
  }

  get actionColorClass(): string {
    return this.isBanPhase ? 'val-red-text' : 'val-cyan-text';
  }
}