import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatchService } from '../match.service';
import { MatchState, MapInfo } from '../models';

const BAN_PHASE_ID = 0;
const PICK_PHASE_ID = 1;
const COMPLETED_PHASE_ID = 2;

@Component({
    standalone: true,
    selector: 'app-match-page',
    imports: [CommonModule, FormsModule],
    templateUrl: './match-state-page.component.html',
    styleUrls: ['./match-state-page.component.css']
})
export class MatchStatePageComponent implements OnInit, OnDestroy {

    matchId = '';
    match?: MatchState;

    myTeamIndex: number | null = null;
    role: 'captain' | 'spectator' | null = null;
    captainToken: string | null = null;

    loading = false;
    errorMessage = '';

    private pollHandle: any;

    readonly BAN_PHASE_ID = BAN_PHASE_ID;
    readonly PICK_PHASE_ID = PICK_PHASE_ID;
    readonly COMPLETED_PHASE_ID = COMPLETED_PHASE_ID;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private matchService: MatchService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    private get isBrowser(): boolean {
        return isPlatformBrowser(this.platformId);
    }


    ngOnInit() {
        // read :id from route
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (!id) return;
            this.matchId = id;

            const teamParam = params.get('teamIndex'); // "0" | "1" | null

            if (teamParam !== null) {
                const teamIndex = Number(teamParam);
                this.myTeamIndex = isNaN(teamIndex) ? null : teamIndex;

                if (this.isBrowser) {
                    const stored = localStorage.getItem(`match_${id}_team_${teamParam}_auth`);
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            this.role = parsed.role ?? 'captain';
                            this.myTeamIndex = typeof parsed.team === 'number' ? parsed.team : teamIndex;
                            this.captainToken = parsed.token ?? null;
                        } catch {
                            this.role = 'captain';
                            this.captainToken = null;
                        }
                    } else {
                        this.role = 'spectator';
                        this.myTeamIndex = null;
                        this.captainToken = null;
                    }
                } else {
                    // SSR pass
                    this.role = null;
                    this.captainToken = null;
                }
            } else {
                // /match/:id with no teamIndex means spectator
                this.role = 'spectator';
                this.myTeamIndex = null;
                this.captainToken = null;
            }


            this.loadState(true);
            this.startPolling();
        });
    }

    ngOnDestroy() {
        this.stopPolling();
    }

    private startPolling() {
        if (this.pollHandle) clearInterval(this.pollHandle);
        this.pollHandle = setInterval(() => {
            this.loadState(false);
        }, 2000);
    }

    private stopPolling() {
        if (this.pollHandle) {
            clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }

    loadState(startPollingOnSuccess: boolean) {
        if (!this.matchId) return;

        this.matchService.getState(this.matchId)
            .subscribe({
                next: state => {
                    this.match = state;
                },
                error: err => {
                    console.error('Load state error:', err);
                    this.errorMessage = 'Failed to load state';

                    this.stopPolling();

                    this.router.navigate(['/']);
                }
            });
    }

    // helpers

    getPhaseLabel(): string {
        if (!this.match) return '';
        const p = Number(this.match.phase);
        switch (p) {
            case BAN_PHASE_ID: return 'Ban Phase';
            case PICK_PHASE_ID: return 'Pick Phase';
            case COMPLETED_PHASE_ID: return 'Completed';
            default: return `Phase ${p}`;
        }
    }

    getCurrentTeamName(): string {
        if (!this.match) return '';
        const idx = this.match.currentTurnTeam;
        return this.match.teams[idx]?.name ?? `Team ${idx}`;
    }

    getMapNameById(mapId: number): string {
        if (!this.match || !mapId) return '';
        const map = this.match.availableMaps.find(m => m.id === mapId);
        return map ? map.name : `Map ${mapId}`;
    }

    isMapBanned(map: MapInfo): boolean {
        if (!this.match) return false;
        return this.match.teams.some(team => team.bannedMapIds.includes(map.id));
    }

    isMapPicked(map: MapInfo): boolean {
        if (!this.match) return false;
        return this.match.teams.some(team =>
            team.pickedMapIds.includes(map.id)
        );
    }

    isDecider(map: MapInfo): boolean {
        if (!this.match) return false;
        return Number(this.match.phase) === COMPLETED_PHASE_ID &&
            this.match.deciderMapId === map.id;
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
        return team.pickedMapIds.map(id => this.getMapNameById(id)).filter(Boolean);
    }

    getDeciderMapName(): string {
        if (!this.match || !this.match.deciderMapId) return '';
        return this.getMapNameById(this.match.deciderMapId);
    }

    getDeciderMapGif(): string | null {
    const name = this.getDeciderMapName();
    if (!name) return null;

    const n = name.toLowerCase();
    if (n.includes('abyss')) return 'assets/maps/abyss.gif';
    if (n.includes('ascent')) return 'public/ascent.webp';
    if (n.includes('corrode')) return 'assets/maps/corrode.gif';
    if (n.includes('haven')) return 'assets/maps/haven.gif';
    if (n.includes('pearl')) return 'assets/maps/pearl.gif';
    if (n.includes('split')) return 'assets/maps/split.gif';
    if (n.includes('sunset')) return 'assets/maps/sunset.gif';

    // fallback
    return 'assets/maps/default.gif';
  }

    onMapClick(map: MapInfo) {
        if (!this.matchId || !this.match) {
            this.errorMessage = 'Create or join a match first';
            return;
        }
        if (this.role !== 'captain' || this.myTeamIndex === null || !this.captainToken) {
            this.errorMessage = 'Only team captains can make picks/bans';
            return;
        }

        this.errorMessage = '';

        if (this.match.currentTurnTeam !== this.myTeamIndex) {
            this.errorMessage = `It is currently ${this.getCurrentTeamName()}'s turn`;
            return;
        }

        let action: 'ban' | 'pick';
        if (this.match.phase === BAN_PHASE_ID) {
            action = 'ban';
        } else if (this.match.phase === PICK_PHASE_ID) {
            action = 'pick';
        } else {
            this.errorMessage = 'Match is already completed';
            return;
        }

        this.loading = true;
        this.matchService.applyAction(this.matchId, this.myTeamIndex, action, map.id, this.captainToken)
            .subscribe({
                next: state => {
                    this.match = state;
                    this.loading = false;
                },
                error: err => {
                    console.error('Action error:', err);
                    this.errorMessage = 'Action rejected by server';
                    this.loading = false;
                }
            });
    }
}
