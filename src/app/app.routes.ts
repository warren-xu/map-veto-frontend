import { Routes } from '@angular/router';
import { CreateMatchPageComponent } from './create-match/create-match-page.component';
import { JoinMatchPageComponent } from './join-match/join-match-page.component';
import { MatchStatePageComponent } from './match-state/match-state-page.component';
import { MatchPreviewComponent } from './match-summary/match-summary-page.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent},
  { path: 'create', component: CreateMatchPageComponent },
  { path: 'join', component: JoinMatchPageComponent },
  { path: 'match/:id/team/:teamIndex', component: MatchStatePageComponent },
  { path: 'match/:id', component: MatchStatePageComponent },
  { path: 'match/:id/preview', component: MatchPreviewComponent },
  { path: '**', redirectTo: 'create' }
];
