using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MfbCinema.Api.Models;

namespace MfbCinema.Api.Hubs;

[Authorize]
public sealed class WatchPartyHub(CinemaDb db) : Hub
{
    public async Task JoinRoom(string roomCode)
    {
        var userId = GetUserId();
        var room = await db.WatchPartyRooms.AsNoTracking()
            .SingleOrDefaultAsync(r => r.RoomCode == roomCode && r.IsActive);
        if (room is null) throw new HubException("Watch party room was not found or has ended.");
        var isParticipant = await db.WatchPartyParticipants.AnyAsync(p => p.RoomId == room.Id && p.UserAccountId == userId);
        if (!isParticipant) throw new HubException("Join the room through the API before connecting to its SignalR group.");
        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);
        await Clients.Caller.SendAsync("PlaybackState", new { room.RoomCode, room.MovieId, room.IsPlaying, room.PositionSeconds, room.UpdatedAtUtc });
    }

    public async Task LeaveRoom(string roomCode) => await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomCode);

    public async Task SendPlaybackState(string roomCode, string command, double positionSeconds)
    {
        if (command is not ("play" or "pause" or "seek")) throw new HubException("Unsupported playback command.");
        if (double.IsNaN(positionSeconds) || double.IsInfinity(positionSeconds) || positionSeconds < 0 || positionSeconds > 604800)
            throw new HubException("Playback position is outside the accepted range.");
        var userId = GetUserId();
        var room = await db.WatchPartyRooms.SingleOrDefaultAsync(r => r.RoomCode == roomCode && r.IsActive);
        if (room is null) throw new HubException("Watch party room was not found or has ended.");
        var participant = await db.WatchPartyParticipants.AnyAsync(p => p.RoomId == room.Id && p.UserAccountId == userId);
        if (!participant) throw new HubException("You are not a participant in this room.");
        room.PositionSeconds = positionSeconds;
        room.IsPlaying = command == "play";
        room.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await Clients.Group(roomCode).SendAsync("PlaybackState", new { roomCode, room.MovieId, command, room.IsPlaying, room.PositionSeconds, room.UpdatedAtUtc, userId });
    }

    private int GetUserId()
    {
        var id = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(id, out var userId)) throw new HubException("A valid account identity is required.");
        return userId;
    }
}
