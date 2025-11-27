import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatchService } from '../match.service';

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

    constructor(
        private matchService: MatchService,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    private get isBrowser(): boolean {
        return isPlatformBrowser(this.platformId);
    }

    joinMatch() {
        this.errorMessage = '';
        this.infoMessage = '';

        if (!this.myMatchId) {
            this.errorMessage = 'Enter a match ID to join.';
            return;
        }

        const teamParam: '0' | '1' | 'spectator' =
            this.myTeamIndex === null ? 'spectator' :
                (this.myTeamIndex === 0 ? '0' : '1');

        this.loading = true;
        this.matchService.joinMatch(this.myMatchId, teamParam)
            .subscribe({
                next: resp => {
                    this.loading = false;
                    this.infoMessage = `Joined as ${resp.role.toUpperCase()}` +
                        (resp.team !== undefined ? ` (Team ${resp.team})` : '');

                    if (resp.role === 'captain' && resp.token && typeof resp.team === 'number') {

                        if (this.isBrowser) {
                            localStorage.setItem(
                                `match_${resp.matchId}_team_${resp.team}_auth`,
                                JSON.stringify({
                                    role: resp.role,
                                    team: resp.team,
                                    token: resp.token
                                })
                            );
                        }

                        this.router.navigate(['/match', resp.matchId, 'team', resp.team]);

                    } else {

                        if (this.isBrowser) {
                            localStorage.setItem(
                                `match_${resp.matchId}_spectator`,
                                JSON.stringify({ role: 'spectator' })
                            );
                        }

                        this.router.navigate(['/match', resp.matchId]);
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
