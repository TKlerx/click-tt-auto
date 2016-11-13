/**
 * This file is part of click-tt-auto, a library doing automated tasks in click-tt.
 * Copyright (C) 2016  the original author or authors.
 *
 * click-tt-auto is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * click-tt-auto is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with click-tt-auto.  If not, see <http://www.gnu.org/licenses/>.
 */
package de.tklerx.dao;

import java.text.ParseException;
import java.util.Calendar;
import java.util.Date;

import org.apache.commons.lang3.time.DateUtils;

public class Player {

	Calendar c = Calendar.getInstance();

	String playerName;
	Date missedDate;
	String team;
	String history;
	String teamLink;

	public Player(String playerName, String missedDate, String team, String history, String teamLink) throws ParseException {
		super();
		this.playerName = playerName;
		Date date = DateUtils.parseDateStrictly(missedDate, new String[]{"dd.MM.yy HH:mm"});
		c.setTime(date);
		c.add(Calendar.DATE, 1);
		this.missedDate = c.getTime();
		this.team = team;
		this.history = history;
		this.teamLink = teamLink;
	}

	@Override
	public String toString() {
		return "Player [playerName=" + playerName + ", resDate=" + missedDate + ", team=" + team + ", history="
				+ history + ", teamLink=" + teamLink + "]";
	}

	public Calendar getC() {
		return c;
	}

	public String getPlayerName() {
		return playerName;
	}

	public Date getResDate() {
		return missedDate;
	}

	public String getTeam() {
		return team;
	}

	public String getHistory() {
		return history;
	}

	public String getTeamLink() {
		return teamLink;
	}
	
}
