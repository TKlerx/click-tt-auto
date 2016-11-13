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
package de.tklerx.run;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;

import com.beust.jcommander.JCommander;
import com.beust.jcommander.Parameter;
import com.beust.jcommander.ParameterException;

import de.tklerx.dao.Player;

public class ResEntries {
	private static final int CLICK_WAIT_TIME = 1500;
	static WebDriver driver;
	List<Player> playerList = new ArrayList<>();
	@Parameter(names = { "--user", "-u" }, required = true, description = "Username for click-tt.")
	String username;
	@Parameter(names = { "--password", "-p" }, required = true, description = "Password for click-tt.")
	String password;
	@Parameter(names = { "--browser", "-b" }, description = "The browser to use.")
	String browser = "firefox";
	// @Parameter(names = { "--season", "-s" },description="The browser to
	// use.")
	// int season = 2016;
	@Parameter(names = "--click-tt-url", description = "The URL to the click-tt login page.")
	String url = "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaAdminTTDE.woa";
	@Parameter(names = "--gecko-driver-path", description = "The path to the firefox driver.")
	String geckoDriverPath = "./lib/geckodriver.exe";

	public static void main(String[] args) throws Exception {
		ResEntries entries = new ResEntries();
		JCommander jc = new JCommander(entries);
		jc.setCaseSensitiveOptions(false);
		try {
			jc.parse(args);
			entries.run();
		} catch (Exception e) {
			e.printStackTrace();
			System.out.println("\n\n\n");
			jc.usage();
			System.exit(1);
		}
	}

	private void run() throws Exception {
		init_Browser();
		loadStartPage();
		page_loginRegister_FormLogin_FillSend();
		// secNavi_LinkTestautomatisierung_Click();
		Thread.sleep(CLICK_WAIT_TIME);
		driver.findElement(By.partialLinkText("Kontrolle")).click();
		Thread.sleep(CLICK_WAIT_TIME);
		driver.findElement(By.partialLinkText("Spieler")).click();
		Thread.sleep(CLICK_WAIT_TIME);
		driver.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Suchen\"]")).click();
		Thread.sleep(10000);
		List<String> otherPlayerPages = new ArrayList<>();
		parsePlayerPage(otherPlayerPages);
		// System.out.println(otherPlayerPages);
		for (String s : otherPlayerPages) {
			driver.get(s);
			Thread.sleep(CLICK_WAIT_TIME);
			parsePlayerPage();
		}
		// for (Player p : playerPages) {
		// processPlayer(p);
		// break;
		// }

	}

	private static List<Player> parsePlayerPage() throws ParseException, InterruptedException {
		return parsePlayerPage(null);
	}

	private static List<Player> parsePlayerPage(List<String> otherPlayerPages)
			throws ParseException, InterruptedException {
		List<Player> result = new ArrayList<>();
		WebElement table = driver.findElement(By.className("result-set"));
		List<WebElement> rows = table.findElements(By.xpath("//tbody/tr"));
		System.out.println("NUMBER OF ROWS IN THIS TABLE = " + rows.size());
		for (WebElement trElement : rows) {
			List<WebElement> td_collection = trElement.findElements(By.xpath("td"));
			System.out.println("NUMBER OF COLUMNS=" + td_collection.size());
			if (td_collection.size() == 3 && otherPlayerPages != null && otherPlayerPages.isEmpty()) {
				// found the header
				// parse the links for the other pages
				List<WebElement> otherPages = td_collection.get(2).findElements(By.xpath("a"));
				for (WebElement e : otherPages) {
					otherPlayerPages.add(e.getAttribute("href"));
				}
			} else if (td_collection.size() == 7) {
				// its a player entry
				String playerName = td_collection.get(0).getText();
				WebElement teamLink = td_collection.get(1);
				String history = td_collection.get(2).getText();
				if (!history.isEmpty()) {
					continue;
				}
				String date = td_collection.get(5).getText();
				String team = td_collection.get(6).getText();
				Player p = new Player(playerName, date, team, history,
						teamLink.findElement(By.xpath("a")).getAttribute("href"));
				result.add(p);
			}
		}
		for (Player p : result) {
			processPlayer(p);
		}
		return result;
	}

	private static void processPlayer(Player p) throws InterruptedException {
		if (!p.getHistory().isEmpty()) {
			return;
		}
		System.out.println("Processing player " + p.getPlayerName());
		System.out.println(p);
		driver.get(p.getTeamLink());
		Thread.sleep(CLICK_WAIT_TIME);
		List<WebElement> herrenList = driver.findElements(By.linkText("Herren"));
		for (WebElement possibleLink : herrenList) {
			String link = possibleLink.getAttribute("href");
			if (link != null) {
				driver.get(link);
				WebElement temp = driver.findElement(By.linkText(p.getPlayerName()));
				temp.click();
				Thread.sleep(CLICK_WAIT_TIME);
				SimpleDateFormat sd = new SimpleDateFormat("dd.MM.yyyy");
				String dt = sd.format(p.getResDate());
				List<WebElement> checkboxes = driver.findElements(By.xpath("//input[@type=\"checkbox\"]"));
				// System.out.println("Size of checkboxes = " +
				// checkboxes.size());
				for (WebElement checkbox : checkboxes) {
					if (checkbox.getAttribute("name").contains(".15")) {
						System.out.println(checkbox.getAttribute("name"));
						checkbox.click();
					}
				}

				WebElement dateField = driver.findElement(By.xpath("//input[@type=\"text\" and @maxlength=\"10\"]"));
				dateField.sendKeys(dt);
				WebElement insertButton = driver
						.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Einf�gen\"]"));
				insertButton.click();
				Thread.sleep(CLICK_WAIT_TIME);
				WebElement confirmButton = driver
						.findElement(By.xpath("//input[@type=\"submit\" and @value=\"�bernehmen\"]"));
				confirmButton.click();
				Thread.sleep(CLICK_WAIT_TIME);
				WebElement nextButton = driver
						.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Weiter >>\"]"));
				nextButton.click();
				Thread.sleep(CLICK_WAIT_TIME);
				nextButton = driver.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Weiter >>\"]"));
				nextButton.click();
				Thread.sleep(CLICK_WAIT_TIME);
				WebElement textField = driver.findElement(By.name("newWorkflowRemarks"));
				textField.sendKeys("RES 5x: " + p.getPlayerName());
				WebElement saveButton = driver
						.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Speichern\"]"));
				saveButton.click();
				Thread.sleep(CLICK_WAIT_TIME);
				driver.findElement(By.linkText("Zur�ck zur �bersichtsseite...")).click();
				Thread.sleep(CLICK_WAIT_TIME);
				driver.findElement(By.linkText("Zur�ck zur Einstiegsseite...")).click();
				Thread.sleep(CLICK_WAIT_TIME);
				break;
			}
			// break;
		}
		return;
	}

	public void init_Browser() throws Exception {
		Path p = Paths.get(geckoDriverPath);
		if (Files.notExists(p)) {
			System.err.println("Path " + p + " does not exist. Please specify path to gecko driver!");
			throw new ParameterException("Path " + p + " does not exist. Please specify path to gecko driver!");
		}
		System.setProperty("webdriver.gecko.driver", p.toString());

		if (browser.equalsIgnoreCase("Firefox")) {
			driver = new FirefoxDriver();
		} else if (browser.equalsIgnoreCase("Chrome")) {
			String pathToChromeDriver = ".//ChromeDriver//chromedriver_Win_220.exe";
			System.setProperty("webdriver.chrome.driver", pathToChromeDriver);
			driver = new ChromeDriver();
		} else {
			System.out.println("Browser not defined!");
			throw new Exception("Browser not defined!");
		}
		driver.manage().timeouts().pageLoadTimeout(30, TimeUnit.SECONDS);
		driver.manage().timeouts().implicitlyWait(20, TimeUnit.SECONDS);
	}

	public void loadStartPage() {

		driver.get(url);

	}

	public void page_loginRegister_FormLogin_FillSend() {

		driver.findElement(By.xpath("//input[@type=\"text\"]")).sendKeys(username);
		driver.findElement(By.xpath("//input[@type=\"password\"]")).sendKeys(password);

		driver.findElement(By.xpath("//input[@type=\"submit\" and @value=\"Login\"]")).click();
		/* verify logged-in correctly */
		String fullBodyText = driver.findElement(By.id("content-row1")).getText();
		System.out.println(fullBodyText);
	}

	public void secNavi_LinkTestautomatisierung_Click() {

		driver.findElement(By.id("menu-item-695")).click();

		/* verify Page is loaded correctly */
		String fullBodyText = driver.findElement(By.id("content-row1")).getText();
		System.out.println(fullBodyText);

	}
}
