import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatchState } from './models';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class MatchService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  createMatch(teamA: string, teamB: string, series: "bo1" | "bo3"): Observable<{ matchId: string }> {
    const url = `${this.baseUrl}/match/create?teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}&series=${series}`;
    return this.http.get<{ matchId: string }>(url);
  }

  getState(matchId: string): Observable<MatchState> {
    const url = `${this.baseUrl}/match/state?id=${encodeURIComponent(matchId)}`;
    return this.http.get<MatchState>(url);
  }

  joinMatch(matchId: string, team: '0' | '1' | 'spectator', token?: string):
    Observable<{ matchId: string; role: 'captain' | 'spectator'; team?: number; token?: string }> {
    let url = `${this.baseUrl}/match/join?id=${encodeURIComponent(matchId)}&team=${team}`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return this.http.get<{ matchId: string; role: 'captain' | 'spectator'; team?: number; token?: string }>(url);
  }

  applyAction(matchId: string, teamIndex: number, action: 'ban' | 'pick' | 'side', mapId: number, token: string): Observable<MatchState> {
    const url = `${this.baseUrl}/match/action?id=${encodeURIComponent(matchId)}&team=${teamIndex}&action=${action}&map=${mapId}&token=${encodeURIComponent(token)}`;
    return this.http.get<MatchState>(url);
  }
}
