import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatchService } from './match.service';
import { MatchState, MapInfo } from './models';
const TEAM_A_NAME = 'Team A';
const TEAM_B_NAME = 'Team B';
const TEAM_A_INDEX = 0;
const TEAM_B_INDEX = 1;
const DEFAULT_SLOTS_PER_TEAM = 1;
const BAN_PHASE_ID = 0;
const PICK_PHASE_ID = 1;
const COMPLETED_PHASE_ID = 2;
const UNASSIGNED_MAP_ID = 0;
@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})

export class AppComponent {

    title = 'Valorant BO3 Map Veto';

    teamAName = TEAM_A_NAME;
    teamBName = TEAM_B_NAME;
    seriesType: "bo1" | "bo3" = "bo1";

    matchId = "";
    match?: MatchState;

    myMatchId = "";           // text box for users joining specific match and team
    myTeamIndex: number | null = null;
    role: 'captain' | 'spectator' | null = null;
    captainToken: string | null = null;

    selectedTeamIndex = TEAM_A_INDEX;
    selectedAction: 'ban' | 'pick' = 'ban';

    loading = false;
    errorMessage = '';

    constructor(private matchService: MatchService) { }

    ngOnInit() {
        // Poll every 2 seconds
        setInterval(() => {
            if (this.matchId) {
                this.loadState();
            }
        }, 2000);
    }

    createMatch() {
        this.errorMessage = '';
        this.loading = true;
        console.log('Creating match...', this.teamAName, this.teamBName, this.seriesType);

        this.matchService.createMatch(this.teamAName, this.teamBName, this.seriesType)
            .subscribe({
                next: resp => {
                    console.log('Create match result:', resp);
                    this.matchId = resp.matchId;
                    this.loading = false;
                    this.loadState();
                },
                error: err => {
                    console.error('Create match error:', err);
                    this.errorMessage = 'Failed to create match';
                    this.loading = false;
                }
            });
    }

    joinMatch() {
        this.errorMessage = '';
        if (!this.myMatchId) {
            this.errorMessage = 'Enter a match ID to join.';
            return;
        }
        const teamParam: '0' | '1' | 'spectator' = this.myTeamIndex === null ? 'spectator' :
            (this.myTeamIndex === TEAM_A_INDEX ? '0' : '1');

        this.matchService.joinMatch(this.myMatchId, teamParam, this.captainToken ?? undefined)
            .subscribe({
                next: resp => {
                    this.matchId = resp.matchId;
                    this.role = resp.role;

                    if (resp.role === 'captain' && resp.token) {
                        this.captainToken = resp.token;
                        if (typeof resp.team === 'number') {
                            this.myTeamIndex = resp.team;
                        }

                    } else {
                        this.myTeamIndex = null; // spectator, clear captain info
                    }
                    this.loadState();   // fetch current state from server
                },
                error: err => {
                    console.error('Join match error:', err);
                    this.errorMessage = 'Failed to join match';
                }
            });

        this.matchId = this.myMatchId;
        this.loadState();   // fetch current state from server
    }


    loadState() {
        if (!this.matchId) return;
        console.log('Loading state for', this.matchId);

        this.matchService.getState(this.matchId)
            .subscribe({
                next: state => {
                    this.match = state;
                },
                error: err => {
                    console.error('Load state error:', err);
                    this.errorMessage = 'Failed to load state';
                }
            });
    }

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
        if (!this.match || mapId === UNASSIGNED_MAP_ID) return '';
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
            team.slots.some(slot => slot.mapId === map.id)
        );
    }
    // return true when the match is completed and this map is the decider
    isDecider(map: MapInfo): boolean {
        if (!this.match) return false;
        return Number(this.match.phase) === COMPLETED_PHASE_ID && this.match.deciderMapId === map.id;
    };

    isBo1(): boolean {
        return !!this.match && this.match.seriesType === "bo1";
    };

    isBo3(): boolean {
        return !!this.match && this.match.seriesType === "bo3";
    };


    onMapClick(map: MapInfo) {
        if (!this.matchId || !this.match) {
            this.errorMessage = "Create or join a match first";
            return;
        }
        if (this.role !== "captain" || this.myTeamIndex === null || !this.captainToken) {
            this.errorMessage = "Only team captains can make picks/bans";
            return;
        }

        this.errorMessage = '';

        // Only allow actions on your turn
        if (this.match.currentTurnTeam !== this.myTeamIndex) {
            this.errorMessage = `It is currently ${this.getCurrentTeamName()}'s turn`;
            return;
        }

        // Decide action from server phase
        let action: "ban" | "pick";
        if (this.match.phase === BAN_PHASE_ID) {
            action = "ban";
        } else if (this.match.phase === PICK_PHASE_ID) {
            action = "pick";
        } else {
            this.errorMessage = "Match is already completed";
            return;
        }

        this.loading = true;
        this.matchService.applyAction(this.matchId, this.myTeamIndex, action, map.id, this.captainToken)
            .subscribe({
                next: state => {
                    console.log("Action result:", state);
                    this.match = state;
                    this.loading = false;
                },
                error: err => {
                    console.error("Action error:", err);
                    this.errorMessage = "Action rejected by server";
                    this.loading = false;
                }
            });
    }


}
