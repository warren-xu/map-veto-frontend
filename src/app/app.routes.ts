import { Routes } from '@angular/router';
import { CreateMatchPageComponent } from './create-match/create-match-page.component';
import { JoinMatchPageComponent } from './join-match/join-match-page.component';
import { MatchStatePageComponent } from './match-state/match-state-page.component';
import { MatchPreviewComponent } from './match-summary/match-summary-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: CreateMatchPageComponent },
  { path: 'create', redirectTo: '', pathMatch: 'full' },
  { path: 'join', component: JoinMatchPageComponent },
  { path: 'match/:id/team/:teamIndex', component: MatchStatePageComponent },
  { path: 'match/:id', component: MatchStatePageComponent },
  { path: 'match/:id/preview', component: MatchPreviewComponent },
  { path: '**', redirectTo: 'create' }
];
