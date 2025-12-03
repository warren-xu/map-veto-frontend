import { Routes } from '@angular/router';
import { CreateMatchPageComponent } from './create-match/create-match-page.component';
import { JoinMatchPageComponent } from './join-match/join-match-page.component';
import { MatchStatePageComponent } from './match-state/match-state-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'create', pathMatch: 'full' },
  { path: 'create', component: CreateMatchPageComponent },
  { path: 'join', component: JoinMatchPageComponent },
  { path: 'match/:id/team/:teamIndex', component: MatchStatePageComponent },
  { path: 'match/:id', component: MatchStatePageComponent },
  { path: '**', redirectTo: 'create' }
];
