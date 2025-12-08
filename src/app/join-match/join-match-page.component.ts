import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatchService } from '../match.service';
import { MatchState } from '../models';

@Component({
    standalone: true,
    selector: 'app-join-match-page',
    imports: [CommonModule, FormsModule],
    templateUrl: './join-match-page.component.html',
    styleUrls: ['./join-match-page.component.css']
})
export class JoinMatchPageComponent {
    myMatchId = '';
    myTeamIndex: number | null = null;
    loading = false;
    errorMessage = '';
    infoMessage = '';
    matchPreview?: MatchState;

    selectedTeamName: string | null = null;

    captainTakenTeamA = false;
    captainTakenTeamB = false;

    get bothCaptainsJoined(): boolean {
        return this.captainTakenTeamA && this.captainTakenTeamB;
    }

    captainTakenForTeam(index: number): boolean {
        return index === 0 ? this.captainTakenTeamA : this.captainTakenTeamB;
    }

    constructor(
        private matchService: MatchService,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    // Helpers
    private get isBrowser(): boolean {
        return isPlatformBrowser(this.platformId);      // check if running in browser
    }

    /* Load match information */
    loadMatchInfo() {
        this.errorMessage = '';
        this.infoMessage = '';

        if (!this.myMatchId) {
            this.errorMessage = 'Enter a match ID first.';
            return;
        }

        this.loading = true;
        this.matchService.getState(this.myMatchId).subscribe({
            next: state => {
                this.matchPreview = state;
                this.loading = false;
                this.infoMessage = `Loaded match: ${state.teams[0]?.name} vs ${state.teams[1]?.name}`;
                this.selectedTeamName = null;
                const flags = state.captainTaken ?? [0, 0];

                this.captainTakenTeamA = !!flags[0]; // 0 -> false, 1 -> true, true -> true
                this.captainTakenTeamB = !!flags[1];
                console.log("Both captains joined:", this.bothCaptainsJoined);
            },
            error: err => {
                console.error('Load match info error:', err);
                this.errorMessage = 'Could not load match. Check the ID.';
                this.loading = false;
            }
        });
    }

    /* Get selected team index based on selected team name */
    private getSelectedTeamIndex(): number | null {
        if (!this.matchPreview || !this.selectedTeamName) return null;
        const idx = this.matchPreview.teams.findIndex(
            t => t.name === this.selectedTeamName
        );
        return idx >= 0 ? idx : null;
    }

    joinAsSpectator() {
        this.errorMessage = '';
        this.infoMessage = '';

        if (!this.myMatchId) {
            this.errorMessage = 'Enter a match ID to join.';
            return;
        }

        this.loading = true;
        this.matchService.joinMatch(this.myMatchId, 'spectator').subscribe({
            next: resp => {
                this.loading = false;
                this.infoMessage = 'Joined as SPECTATOR';

                // optional: store spectator role in localStorage & route to /match/:id
                // ...
                this.router.navigate(['/match', resp.matchId]);
            },
            error: err => {
                console.error('Join spectator error:', err);
                this.errorMessage = 'Failed to join as spectator';
                this.loading = false;
            }
        });
    }


    joinMatchAsCaptain() {
        this.errorMessage = '';
        this.infoMessage = '';

        if (!this.myMatchId) {
            this.errorMessage = 'Enter a match ID to join.';
            return;
        }

        if (!this.matchPreview) {
            this.errorMessage = 'Load match info first.';
            return;
        }

        // Captain must have a selected team name
        const idx = this.getSelectedTeamIndex();
        if (idx === null) {
            this.errorMessage = 'Select which team you are captain of.';
            return;
        }

        const teamParam: '0' | '1' = idx === 0 ? '0' : '1';

        this.loading = true;
        this.matchService.joinMatch(this.myMatchId, teamParam).subscribe({
            next: resp => {
                this.loading = false;
                this.infoMessage =
                    `Joined as ${resp.role.toUpperCase()}` +
                    (resp.team !== undefined ? ` (Team ${resp.team})` : '');

                if (this.isBrowser) {
                    if (resp.role === 'captain' && resp.token && typeof resp.team === 'number') {
                        localStorage.setItem(
                            `match_${resp.matchId}_team_${resp.team}_auth`,
                            JSON.stringify({
                                role: resp.role,
                                team: resp.team,
                                token: resp.token
                            })
                        );
                        this.router.navigate(['/match', resp.matchId, 'team', resp.team]);
                    } else {
                        localStorage.setItem(
                            `match_${resp.matchId}_spectator`,
                            JSON.stringify({ role: 'spectator' })
                        );
                        this.router.navigate(['/match', resp.matchId], {replaceUrl: true});
                    }
                } else {
                    // SSR fallback
                    if (resp.role === 'captain' && typeof resp.team === 'number') {
                        this.router.navigate(['/match', resp.matchId, 'team', resp.team], { replaceUrl: true });
                    } else {
                        this.router.navigate(['/match', resp.matchId], { replaceUrl: true });
                    }
                }
            },
            error: err => {
                console.error('Join match error:', err);
                this.errorMessage = 'Failed to join match';
                this.loading = false;
            }
        });
    }

}
