// src/app/match-socket.service.ts
import { Injectable, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { MatchState } from './models';

@Injectable({ providedIn: 'root' })
export class MatchSocketService {
  private socket: WebSocket | null = null;
  private currentMatchId: string | null = null;

  private matchStateSubject = new BehaviorSubject<MatchState | null>(null);
  matchState$: Observable<MatchState | null> = this.matchStateSubject.asObservable();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private zone: NgZone
  ) {}

  private get isBrowser() {
    return isPlatformBrowser(this.platformId);
  }

  connect(matchId: string) {
    if (!this.isBrowser) return;

    if (this.socket && this.currentMatchId === matchId) return;

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.currentMatchId = matchId;
    const wsUrl = `ws://localhost:8080/ws`;
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      console.log('WS open, subscribing to match', matchId);
      // server expects plain matchId as first message
      socket.send(matchId);
    };

    socket.onmessage = (event) => {
      // Make sure Angular knows this happened
      this.zone.run(() => {
        try {
          const data = JSON.parse(event.data);
          console.log('WS match update:', data);
          this.matchStateSubject.next(data as MatchState);
        } catch (e) {
          console.error('WS message parse error:', e, event.data);
        }
      });
    };

    socket.onerror = (err) => {
      this.zone.run(() => console.error('WebSocket error', err));
    };

    socket.onclose = () => {
      this.zone.run(() => {
        console.log('WebSocket closed');
        this.socket = null;
        this.currentMatchId = null;
      });
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.currentMatchId = null;
    }
    this.matchStateSubject.next(null);
  }
}
