package lipsync.training
{
	import flash.geom.Vector3D;
	public class TrainingPattern
	{
		public var input:Vector.<Number>;
		public var output:Vector.<Number>;
			
		public function TrainingPattern(inputPattern:Vector.<Number> = null, outputPattern:Vector.<Number> = null) {
			this.input = inputPattern;
			this.output = outputPattern;
		}
	}
}