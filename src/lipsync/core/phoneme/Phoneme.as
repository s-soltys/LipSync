package lipsync.core.phoneme 
{
	/**
	 * ...
	 * @author S
	 */
	public class Phoneme {
		public static const NULL:Phoneme = new Phoneme("", 0, 0);
		
		public static const v1a:Phoneme = new Phoneme("v1", 2, 1);
		public static const v1b:Phoneme = new Phoneme("v1", 3, 1);
		public static const v2a:Phoneme = new Phoneme("v2", 6, 2);
		public static const v2b:Phoneme = new Phoneme("v2", 7, 2);
		public static const v3a:Phoneme = new Phoneme("v3", 10, 3);
		public static const v3b:Phoneme = new Phoneme("v3", 11, 3);
		public static const v4a:Phoneme = new Phoneme("v4", 14, 4);
		public static const v4b:Phoneme = new Phoneme("v4", 15, 4);
		public static const v5a:Phoneme = new Phoneme("v5", 20, 5);
		public static const v5b:Phoneme = new Phoneme("v5", 21, 5);
		public static const v6a:Phoneme = new Phoneme("v6", 30, 6);
		public static const v6b:Phoneme = new Phoneme("v6", 31, 6);
		public static const v7a:Phoneme = new Phoneme("v7", 40, 7);
		public static const v7b:Phoneme = new Phoneme("v7", 41, 7);
		public static const v8a:Phoneme = new Phoneme("v8", 52, 8);
		public static const v8b:Phoneme = new Phoneme("v8", 53, 8);
		public static const v9a:Phoneme = new Phoneme("v9", 62, 9);
		public static const v9b:Phoneme = new Phoneme("v9", 63, 9);
		
		public var id:int;
		public var symbol:String;
		public var visemeId:int;
		
		public function Phoneme(symbol:String, id:int, visemeId:int) {
			this.symbol = symbol;
			this.id = id;
			this.visemeId = visemeId;
		}
		
	}
}