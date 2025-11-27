import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatchService } from '../match.service';

@Component({
  standalone: true,
  selector: 'app-create-match-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-match-page.component.html',
  styleUrls: ['./create-match-page.component.css']
})
export class CreateMatchPageComponent {
  teamAName = 'Team A';
  teamBName = 'Team B';
  seriesType: 'bo1' | 'bo3' = 'bo1';
  loading = false;
  errorMessage = '';

  constructor(
    private matchService: MatchService,
    private router: Router
  ) {}

  createMatch() {
    this.errorMessage = '';
    this.loading = true;

    this.matchService.createMatch(this.teamAName, this.teamBName, this.seriesType)
      .subscribe({
        next: resp => {
          this.loading = false;
          // Navigate to the match page
          this.router.navigate(['/match', resp.matchId]);
        },
        error: err => {
          console.error('Create match error:', err);
          this.errorMessage = 'Failed to create match';
          this.loading = false;
        }
      });
  }
}
