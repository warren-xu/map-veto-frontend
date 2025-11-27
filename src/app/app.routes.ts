import { Routes } from '@angular/router';
import { CreateMatchPageComponent } from './create-match/create-match-page.component';
import { JoinMatchPageComponent } from './join-match/join-match-page.component';
import { MatchPageComponent } from './match-state/match-state-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'create', pathMatch: 'full' },
  { path: 'create', component: CreateMatchPageComponent },
  { path: 'join', component: JoinMatchPageComponent },
  { path: 'match/:id/team/:teamIndex', component: MatchPageComponent },
  { path: 'match/:id', component: MatchPageComponent },
  { path: '**', redirectTo: 'create' }
];
